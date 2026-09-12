import { count, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { attendanceSessions, organizations, students, users } from "../../db/schema";
import { AppError } from "../../common/errors";
import { generateJoinCode } from "../../common/crypto";
import type { OrganizationType } from "../../common/types/common.types";
import type { UpdateOrganizationInput } from "./organization.types";

// joinCode is included: only send these columns to people allowed to see the code
// (the school's admins, the platform operator). Everyone else gets `publicOrganizationColumns`.
export const organizationColumns = {
  id: organizations.id,
  name: organizations.name,
  type: organizations.type,
  joinCode: organizations.joinCode,
  timezone: organizations.timezone,
  createdAt: organizations.createdAt,
};

export const publicOrganizationColumns = {
  id: organizations.id,
  name: organizations.name,
  type: organizations.type,
};

// `db` or a transaction — so a school and its first admin can be created in ONE transaction
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const organizationServices = {
  async create({ name, type }: { name: string; type: OrganizationType }, tx: Tx | typeof db = db) {
    const [organization] = await tx.insert(organizations)
      .values({ name, type, joinCode: generateJoinCode() })
      .returning(organizationColumns);
    return organization!;
  },

  async getById(id: string) {
    const [organization] = await db.select(organizationColumns).from(organizations).where(eq(organizations.id, id));
    if (!organization) {
      throw new AppError(404, "School not found", "ORGANIZATION_NOT_FOUND");
    }
    return organization;
  },

  // Which timezone decides this school's "today". Read on every scan, so it selects one column
  // rather than the whole row. Falls back to UTC only if the school vanished mid-request.
  async timezoneOf(id: string) {
    const [found] = await db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, id));
    return found?.timezone ?? "UTC";
  },

  // for the sign-up page: "you're joining Sunrise Academy". Never returns the id or anything private.
  async findByJoinCode(joinCode: string) {
    const [organization] = await db.select(publicOrganizationColumns).from(organizations).where(eq(organizations.joinCode, joinCode));
    if (!organization) {
      throw new AppError(404, "No school found with that join code", "INVALID_JOIN_CODE");
    }
    return organization;
  },

  async update(id: string, input: UpdateOrganizationInput) {
    const [organization] = await db.update(organizations).set(input).where(eq(organizations.id, id)).returning(organizationColumns);
    if (!organization) {
      throw new AppError(404, "School not found", "ORGANIZATION_NOT_FOUND");
    }
    return organization;
  },

  // the code leaked / was posted somewhere public → new code. Existing accounts are unaffected;
  // only NEW sign-ups need the new code.
  async regenerateJoinCode(id: string) {
    const [organization] = await db.update(organizations)
      .set({ joinCode: generateJoinCode() })
      .where(eq(organizations.id, id))
      .returning(organizationColumns);
    if (!organization) {
      throw new AppError(404, "School not found", "ORGANIZATION_NOT_FOUND");
    }
    return organization;
  },

  // platform overview: every school with its head counts, newest first
  async listAll() {
    // Students are roster rows, staff are accounts — two different tables, so two subqueries.
    // (`users` still has a legacy `users` role from when students were accounts; those are not
    // staff and must not be counted as such.)
    const studentCounts = db
      .select({ organizationId: students.organizationId, students: count().as("students") })
      .from(students)
      .groupBy(students.organizationId)
      .as("student_counts");

    const staffCounts = db
      .select({ organizationId: users.organizationId, staff: count().as("staff") })
      .from(users)
      .where(ne(users.role, "users"))
      .groupBy(users.organizationId)
      .as("staff_counts");

    const sessionCounts = db
      .select({ organizationId: attendanceSessions.organizationId, sessions: count().as("sessions") })
      .from(attendanceSessions)
      .groupBy(attendanceSessions.organizationId)
      .as("session_counts");

    return await db
      .select({
        ...organizationColumns,
        students: sql<number>`coalesce(${studentCounts.students}, 0)`.mapWith(Number),
        staff: sql<number>`coalesce(${staffCounts.staff}, 0)`.mapWith(Number),
        sessions: sql<number>`coalesce(${sessionCounts.sessions}, 0)`.mapWith(Number),
      })
      .from(organizations)
      .leftJoin(studentCounts, eq(studentCounts.organizationId, organizations.id))
      .leftJoin(staffCounts, eq(staffCounts.organizationId, organizations.id))
      .leftJoin(sessionCounts, eq(sessionCounts.organizationId, organizations.id))
      .orderBy(desc(organizations.createdAt));
  },
};
