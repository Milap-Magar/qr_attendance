import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { attendanceSessions, organizations, users } from "../../db/schema";
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
    const memberCounts = db
      .select({
        organizationId: users.organizationId,
        students: sql<number>`count(*) filter (where ${users.role} = 'users')`.mapWith(Number).as("students"),
        staff: sql<number>`count(*) filter (where ${users.role} <> 'users')`.mapWith(Number).as("staff"),
      })
      .from(users)
      .groupBy(users.organizationId)
      .as("member_counts");

    const sessionCounts = db
      .select({ organizationId: attendanceSessions.organizationId, sessions: count().as("sessions") })
      .from(attendanceSessions)
      .groupBy(attendanceSessions.organizationId)
      .as("session_counts");

    return await db
      .select({
        ...organizationColumns,
        students: sql<number>`coalesce(${memberCounts.students}, 0)`.mapWith(Number),
        staff: sql<number>`coalesce(${memberCounts.staff}, 0)`.mapWith(Number),
        sessions: sql<number>`coalesce(${sessionCounts.sessions}, 0)`.mapWith(Number),
      })
      .from(organizations)
      .leftJoin(memberCounts, eq(memberCounts.organizationId, organizations.id))
      .leftJoin(sessionCounts, eq(sessionCounts.organizationId, organizations.id))
      .orderBy(desc(organizations.createdAt));
  },
};
