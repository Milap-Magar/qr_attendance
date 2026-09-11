import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { attendanceRecords, attendanceSessions, users } from "../../db/schema";
import { AppError } from "../../common/errors";
import type { CreateSessionInput } from "./attendance.types";

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

export const attendanceServices = {
  async createSession(input: CreateSessionInput, openedBy: string) {
    const [session] = await db.insert(attendanceSessions)
      .values({ ...input, openedBy })
      .returning(sessionColumns);
    return withStatus({ ...session!, checkedInCount: 0 });
  },

  async listSessions() {
    const sessions = await selectSessionsWithCount().orderBy(desc(attendanceSessions.opensAt));
    return sessions.map(withStatus);
  },

  async getSession(id: string) {
    const [session] = await selectSessionsWithCount().where(eq(attendanceSessions.id, id));
    if (!session) {
      throw new AppError(404, "Session not found", "SESSION_NOT_FOUND");
    }
    return withStatus(session);
  },

  // close early = move closesAt to now. (if it hadn't started yet, opensAt moves to now too)
  async closeSession(id: string) {
    const session = await attendanceServices.getSession(id); // 404 if missing
    if (session.status === "closed") return session;

    await db.update(attendanceSessions)
      .set({ closesAt: sql`now()`, opensAt: sql`least(${attendanceSessions.opensAt}, now())` })
      .where(eq(attendanceSessions.id, id));
    return attendanceServices.getSession(id);
  },

  // who checked in to this session, in scan order
  async getSessionRecords(sessionId: string) {
    await attendanceServices.getSession(sessionId); // 404 if missing
    return await db
      .select({
        id: attendanceRecords.id,
        scannedAt: attendanceRecords.scannedAt,
        scannedBy: attendanceRecords.scannedBy,
        student: { id: users.id, name: users.name, email: users.email },
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(users.id, attendanceRecords.userId))
      .where(eq(attendanceRecords.sessionId, sessionId))
      .orderBy(asc(attendanceRecords.scannedAt));
  },

  // a student's own history, newest first
  async getMyAttendance(userId: string) {
    return await db
      .select({
        id: attendanceRecords.id,
        scannedAt: attendanceRecords.scannedAt,
        session: { id: attendanceSessions.id, title: attendanceSessions.title, opensAt: attendanceSessions.opensAt },
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
      .where(eq(attendanceRecords.userId, userId))
      .orderBy(desc(attendanceRecords.scannedAt));
  },
};
