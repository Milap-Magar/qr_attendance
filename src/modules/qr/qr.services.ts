import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { attendanceRecords, credentials, users } from "../../db/schema";
import { AppError } from "../../common/errors";
import { generateToken, hashToken } from "../../common/crypto";
import { userServices } from "../users/user.service";
import { attendanceServices, sessionStatus } from "../attendance/attendance.services";
import type { ScanInput } from "./qr.types";

// safe columns — token_hash is never sent to anyone
const credentialColumns = {
  id: credentials.id,
  userId: credentials.userId,
  method: credentials.method,
  createdAt: credentials.createdAt,
  revokedAt: credentials.revokedAt,
};

export const qrServices = {
  // Issue a QR card for a student.
  // Returns the plain `token` ONCE — the frontend turns it into a QR image for printing.
  // We only keep its hash, so if the card is lost the answer is "issue a new one", not "look it up".
  async issueCredential(userId: string) {
    await userServices.getUserById(userId); // throws 404 if the student doesn't exist

    const token = generateToken();

    // one active card per student: revoke the old card(s) and create the new one.
    // transaction = both happen, or neither does.
    const credential = await db.transaction(async (tx) => {
      await tx.update(credentials)
        .set({ revokedAt: new Date() })
        .where(and(eq(credentials.userId, userId), isNull(credentials.revokedAt)));

      const [created] = await tx.insert(credentials)
        .values({ userId, tokenHash: hashToken(token), method: "card" })
        .returning(credentialColumns);
      return created!;
    });

    return { ...credential, token };
  },

  async listCredentials(userId?: string) {
    return await db.select(credentialColumns)
      .from(credentials)
      .where(userId ? eq(credentials.userId, userId) : undefined)
      .orderBy(desc(credentials.createdAt));
  },

  // lost/stolen card → revoke it. Revoking twice is fine (returns the same row).
  async revokeCredential(id: string) {
    const [revoked] = await db.update(credentials)
      .set({ revokedAt: new Date() })
      .where(and(eq(credentials.id, id), isNull(credentials.revokedAt)))
      .returning(credentialColumns);
    if (revoked) return revoked;

    const [existing] = await db.select(credentialColumns).from(credentials).where(eq(credentials.id, id));
    if (!existing) {
      throw new AppError(404, "Credential not found", "CREDENTIAL_NOT_FOUND");
    }
    return existing; // was already revoked
  },

  // THE SCAN. The scanner only decodes the image and sends the text;
  // every check happens here, using the SERVER's clock (a laptop clock can be wrong or faked).
  async scan({ sessionId, token }: ScanInput, scannedBy: string) {
    // 1. is the session open right now?
    const session = await attendanceServices.getSession(sessionId); // 404 if missing
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
        student: { id: users.id, name: users.name, email: users.email },
      })
      .from(credentials)
      .innerJoin(users, eq(users.id, credentials.userId))
      .where(eq(credentials.tokenHash, hashToken(token)));

    if (!card) {
      throw new AppError(404, "Unknown QR code", "QR_NOT_FOUND");
    }
    // 403 (not 401): 401 would make the frontend think the OPERATOR's login expired
    if (card.revokedAt) {
      throw new AppError(403, "This QR card has been revoked", "QR_REVOKED");
    }

    // 3. record it. The unique (session_id, user_id) constraint makes a second scan
    //    insert nothing, instead of creating a duplicate row.
    const [record] = await db.insert(attendanceRecords)
      .values({ sessionId, userId: card.student.id, credentialId: card.credentialId, scannedBy })
      .onConflictDoNothing({ target: [attendanceRecords.sessionId, attendanceRecords.userId] })
      .returning({ id: attendanceRecords.id, scannedAt: attendanceRecords.scannedAt });

    if (!record) {
      throw new AppError(409, `${card.student.name} is already checked in`, "ALREADY_SCANNED");
    }

    return {
      message: "Checked in",
      student: card.student,
      session: { id: session.id, title: session.title },
      record,
    };
  },
};
