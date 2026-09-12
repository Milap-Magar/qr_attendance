import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import { attendanceRecords, classes, credentials, students } from "../../db/schema";
import { AppError } from "../../common/errors";
import { hashToken } from "../../common/crypto";
import { schoolDay } from "../../common/school-day";
import { classLabel, classServices } from "../classes/class.services";
import { studentServices } from "../students/student.services";
import { organizationServices } from "../organizations/organization.services";
import { attendanceServices, sessionStatus } from "../attendance/attendance.services";
import { credentialColumns, issueCardFor } from "./credential.core";
import type { ScanInput } from "./qr.types";

// ids of everyone in one school — to scope credential queries
// (a credential belongs to a school through its student)
const studentsOf = (orgId: string) =>
  db.select({ id: students.id }).from(students).where(eq(students.organizationId, orgId));

export const qrServices = {
  // Re-issue ONE student's card: lost, damaged, or never printed.
  // The old card stops working the instant this returns, so only do it when the old one is gone.
  // Returns the plain `token` once — it cannot be looked up afterwards.
  async issueCredential(studentId: string, orgId: string) {
    await studentServices.getById(studentId, orgId); // 404 if the student is missing / another school's
    return await issueCardFor(studentId);
  },

  // Issue cards for a whole class in one go — the "we just added Grade 10 A, print their cards" flow.
  //
  // `only: "missing"` (the default) skips students who already hold a working card, so running this
  // twice doesn't invalidate cards that are already in students' hands. `only: "all"` reprints the
  // entire class and revokes every existing card — only for a fresh batch of physical cards.
  async issueClassCards(classId: string, orgId: string, only: "missing" | "all" = "missing") {
    const group = await classServices.getById(classId, orgId); // 404 if missing / other school
    const roster = await studentServices.list(orgId, { classId, includeInactive: false });

    const targets = only === "all" ? roster : roster.filter((student) => !student.hasActiveCard);

    // One transaction: either the whole class gets printable cards or nothing changes, so there is
    // never a half-printed batch to reconcile by hand.
    //
    // Sequential, not Promise.all: a transaction is a single connection, and firing its writes
    // concurrently leaves their order up to the driver. A class is at most a few dozen students.
    const cards = await db.transaction(async (tx) => {
      const issued = [];
      for (const student of targets) {
        issued.push({
          student: { id: student.id, name: student.name, rollNo: student.rollNo },
          card: await issueCardFor(student.id, tx),
        });
      }
      return issued;
    });

    return {
      class: { id: group.id, label: group.label, academicYear: group.academicYear },
      issued: cards.length,
      skipped: roster.length - targets.length, // already held a working card
      cards,
    };
  },

  // card history for the school, newest first (never includes the token)
  async listCredentials(orgId: string, studentId?: string) {
    return await db.select(credentialColumns)
      .from(credentials)
      .where(and(
        inArray(credentials.studentId, studentsOf(orgId)),
        studentId ? eq(credentials.studentId, studentId) : undefined,
      ))
      .orderBy(desc(credentials.createdAt));
  },

  // lost/stolen card → revoke it. Revoking twice is fine (returns the same row).
  async revokeCredential(id: string, orgId: string) {
    const mine = and(eq(credentials.id, id), inArray(credentials.studentId, studentsOf(orgId)));
    const [revoked] = await db.update(credentials)
      .set({ revokedAt: new Date() })
      .where(and(mine, isNull(credentials.revokedAt)))
      .returning(credentialColumns);
    if (revoked) return revoked;

    const [existing] = await db.select(credentialColumns).from(credentials).where(mine);
    if (!existing) {
      throw new AppError(404, "Credential not found", "CREDENTIAL_NOT_FOUND");
    }
    return existing; // was already revoked
  },

  // THE SCAN. The scanner only decodes the image and sends the text;
  // every check happens here, using the SERVER's clock and the SCHOOL's timezone
  // (a laptop clock can be wrong or deliberately set back).
  //
  // Attendance is per DAY: the first scan into any open session marks the student present for
  // today, and every later scan that day is reported back as "already present", not an error to fix.
  async scan({ sessionId, token }: ScanInput, scannedBy: string, orgId: string) {
    // 1. is the session open right now? (and is it one of MY school's sessions?)
    const session = await attendanceServices.getSession(sessionId, orgId); // 404 if missing / other school
    const status = sessionStatus(session);
    if (status === "upcoming") {
      throw new AppError(409, "This session has not started yet", "SESSION_NOT_OPEN");
    }
    if (status === "closed") {
      throw new AppError(409, "This session is closed", "SESSION_CLOSED");
    }

    // 2. which student owns this QR code? (look up by hash — the DB never saw the token)
    const [card] = await db
      .select({
        credentialId: credentials.id,
        revokedAt: credentials.revokedAt,
        student: {
          id: students.id,
          name: students.name,
          rollNo: students.rollNo,
          isActive: students.isActive,
        },
        class: { id: classes.id, grade: classes.grade, section: classes.section },
      })
      .from(credentials)
      .innerJoin(students, eq(students.id, credentials.studentId))
      .innerJoin(classes, eq(classes.id, students.classId))
      // a card from ANOTHER school is simply unknown here: same 404, nothing about that school leaks
      .where(and(eq(credentials.tokenHash, hashToken(token)), eq(students.organizationId, orgId)));

    if (!card) {
      throw new AppError(404, "Unknown QR code", "QR_NOT_FOUND");
    }
    // 403 (not 401): 401 would make the frontend think the OPERATOR's login expired
    if (card.revokedAt) {
      throw new AppError(403, "This QR card has been revoked", "QR_REVOKED");
    }
    if (!card.student.isActive) {
      throw new AppError(403, `${card.student.name} is no longer enrolled`, "STUDENT_INACTIVE");
    }

    // 3. today, as the SCHOOL reckons it
    const timezone = await organizationServices.timezoneOf(orgId);
    const attendanceDate = schoolDay(timezone);

    const student = {
      ...card.student,
      class: { ...card.class, label: classLabel(card.class) },
    };

    // 4. mark present. The unique (student_id, attendance_date) constraint makes a second scan
    //    the same day insert nothing, instead of creating a duplicate row — even if it lands in
    //    a different session, and even if two scanners fire at the same millisecond.
    const [record] = await db.insert(attendanceRecords)
      .values({ sessionId, studentId: student.id, credentialId: card.credentialId, scannedBy, attendanceDate })
      .onConflictDoNothing({ target: [attendanceRecords.studentId, attendanceRecords.attendanceDate] })
      .returning({ id: attendanceRecords.id, scannedAt: attendanceRecords.scannedAt, attendanceDate: attendanceRecords.attendanceDate });

    if (!record) {
      // Not a failure: the student IS present, someone already scanned them. Tell the operator
      // what time, so they can wave the queue along instead of trying the card again.
      const [already] = await db
        .select({ scannedAt: attendanceRecords.scannedAt })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.studentId, student.id), eq(attendanceRecords.attendanceDate, attendanceDate)));

      const at = already && new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone, hour: "2-digit", minute: "2-digit",
      }).format(already.scannedAt);

      throw new AppError(
        409,
        at ? `${student.name} was already marked present at ${at}` : `${student.name} is already marked present today`,
        "ALREADY_PRESENT",
      );
    }

    return {
      message: "Marked present",
      student,
      session: { id: session.id, title: session.title },
      record,
    };
  },
};
