import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { attendanceRecords, attendanceSessions, classes, students } from "../../db/schema";
import { AppError } from "../../common/errors";
import { schoolDay } from "../../common/school-day";
import { classLabel, classServices } from "../classes/class.services";
import { organizationServices } from "../organizations/organization.services";
import type { CreateSessionInput, DailyReportQuery } from "./attendance.types";

export type SessionStatus = "upcoming" | "open" | "closed";

// There is no is_open column: the status is worked out from the times, so it can never get out of sync.
export function sessionStatus(session: { opensAt: Date; closesAt: Date }, now = new Date()): SessionStatus {
  if (now < session.opensAt) return "upcoming";
  if (now < session.closesAt) return "open";
  return "closed";
}

const sessionColumns = {
  id: attendanceSessions.id,
  title: attendanceSessions.title,
  openedBy: attendanceSessions.openedBy,
  opensAt: attendanceSessions.opensAt,
  closesAt: attendanceSessions.closesAt,
  createdAt: attendanceSessions.createdAt,
};

// sessions + how many students checked in (LEFT JOIN so empty sessions show 0)
function selectSessionsWithCount() {
  return db
    .select({ ...sessionColumns, checkedInCount: count(attendanceRecords.id) })
    .from(attendanceSessions)
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .groupBy(attendanceSessions.id)
    .$dynamic();
}

// adds the computed `status` field the frontend shows
const withStatus = <T extends { opensAt: Date; closesAt: Date }>(session: T) => ({
  ...session,
  status: sessionStatus(session),
});

// A register is read in roll-number order. Roll numbers are text, so "10" would sort before "2";
// sorting by length first fixes that for numeric ones without breaking "2026/007".
const byRollNo = [sql`length(${students.rollNo})`, asc(students.rollNo)];

// Every function takes the caller's school (orgId). A session from another school is a 404,
// exactly like one that doesn't exist.
export const attendanceServices = {
  async createSession(input: CreateSessionInput, openedBy: string, orgId: string) {
    const [session] = await db.insert(attendanceSessions)
      .values({ ...input, openedBy, organizationId: orgId })
      .returning(sessionColumns);
    return withStatus({ ...session!, checkedInCount: 0 });
  },

  async listSessions(orgId: string) {
    const sessions = await selectSessionsWithCount()
      .where(eq(attendanceSessions.organizationId, orgId))
      .orderBy(desc(attendanceSessions.opensAt));
    return sessions.map(withStatus);
  },

  async getSession(id: string, orgId: string) {
    const [session] = await selectSessionsWithCount()
      .where(and(eq(attendanceSessions.id, id), eq(attendanceSessions.organizationId, orgId)));
    if (!session) {
      throw new AppError(404, "Session not found", "SESSION_NOT_FOUND");
    }
    return withStatus(session);
  },

  // close early = move closesAt to now. (if it hadn't started yet, opensAt moves to now too)
  async closeSession(id: string, orgId: string) {
    const session = await attendanceServices.getSession(id, orgId); // 404 if missing / other school
    if (session.status === "closed") return session;

    await db.update(attendanceSessions)
      .set({ closesAt: sql`now()`, opensAt: sql`least(${attendanceSessions.opensAt}, now())` })
      .where(eq(attendanceSessions.id, id));
    return attendanceServices.getSession(id, orgId);
  },

  // who was scanned in this session, in scan order, with the class each student belongs to
  async getSessionRecords(sessionId: string, orgId: string) {
    await attendanceServices.getSession(sessionId, orgId); // 404 if missing / other school
    const rows = await db
      .select({
        id: attendanceRecords.id,
        scannedAt: attendanceRecords.scannedAt,
        scannedBy: attendanceRecords.scannedBy,
        attendanceDate: attendanceRecords.attendanceDate,
        student: { id: students.id, name: students.name, rollNo: students.rollNo },
        class: { id: classes.id, grade: classes.grade, section: classes.section },
      })
      .from(attendanceRecords)
      .innerJoin(students, eq(students.id, attendanceRecords.studentId))
      .innerJoin(classes, eq(classes.id, students.classId))
      .where(eq(attendanceRecords.sessionId, sessionId))
      .orderBy(asc(attendanceRecords.scannedAt));

    return rows.map((row) => ({ ...row, class: { ...row.class, label: classLabel(row.class) } }));
  },

  // THE REPORT. One class, one day, every student on the roster — present or absent, by roll number.
  //
  // It starts from `students` and LEFT JOINs the day's record, which is what makes absences
  // visible: a student with no record simply has no scan, and that is the answer, not missing data.
  async getDailyRegister({ classId, date }: DailyReportQuery, orgId: string) {
    const group = await classServices.getById(classId, orgId); // 404 if missing / other school
    // no date given → the school's today, in ITS timezone, not the server's
    const day = date ?? schoolDay(await organizationServices.timezoneOf(orgId));

    const roster = await db
      .select({
        student: { id: students.id, name: students.name, rollNo: students.rollNo, gender: students.gender },
        scannedAt: attendanceRecords.scannedAt,
        sessionId: attendanceRecords.sessionId,
      })
      .from(students)
      // the join is ON the date as well, so this is "that student's record FOR THAT DAY",
      // not "any record they ever had"
      .leftJoin(attendanceRecords, and(
        eq(attendanceRecords.studentId, students.id),
        eq(attendanceRecords.attendanceDate, day),
      ))
      .where(and(eq(students.classId, classId), eq(students.isActive, true)))
      .orderBy(...byRollNo);

    const entries = roster.map(({ student, scannedAt, sessionId }) => ({
      ...student,
      present: scannedAt !== null,
      scannedAt,
      sessionId,
    }));
    const present = entries.filter((entry) => entry.present).length;

    return {
      date: day,
      class: { id: group.id, label: group.label, academicYear: group.academicYear },
      present,
      absent: entries.length - present,
      total: entries.length,
      students: entries,
    };
  },

  // School-wide summary for one day: every class with its present/absent tally.
  // The landing page for "how did today go".
  async getDailySummary(date: string | undefined, orgId: string) {
    const day = date ?? schoolDay(await organizationServices.timezoneOf(orgId));

    const rows = await db
      .select({
        id: classes.id,
        grade: classes.grade,
        section: classes.section,
        academicYear: classes.academicYear,
        total: count(students.id),
        present: sql<number>`count(${attendanceRecords.id})`.mapWith(Number),
      })
      .from(classes)
      .leftJoin(students, and(eq(students.classId, classes.id), eq(students.isActive, true)))
      .leftJoin(attendanceRecords, and(
        eq(attendanceRecords.studentId, students.id),
        eq(attendanceRecords.attendanceDate, day),
      ))
      .where(eq(classes.organizationId, orgId))
      .groupBy(classes.id)
      .orderBy(sql`${classes.academicYear} desc`, sql`length(${classes.grade})`, asc(classes.grade), asc(classes.section));

    const classSummaries = rows.map((row) => ({
      ...row,
      label: classLabel(row),
      absent: row.total - row.present,
    }));

    return {
      date: day,
      present: classSummaries.reduce((sum, row) => sum + row.present, 0),
      total: classSummaries.reduce((sum, row) => sum + row.total, 0),
      classes: classSummaries,
    };
  },

  // one student's own history, newest first — for the student detail page
  async getStudentAttendance(studentId: string, orgId: string) {
    return await db
      .select({
        id: attendanceRecords.id,
        attendanceDate: attendanceRecords.attendanceDate,
        scannedAt: attendanceRecords.scannedAt,
        session: { id: attendanceSessions.id, title: attendanceSessions.title },
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .innerJoin(students, eq(students.id, attendanceRecords.studentId))
      .where(and(eq(attendanceRecords.studentId, studentId), eq(students.organizationId, orgId)))
      .orderBy(desc(attendanceRecords.attendanceDate));
  },
};
