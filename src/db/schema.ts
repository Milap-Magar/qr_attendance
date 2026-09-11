import { sql } from 'drizzle-orm';
import { boolean, uuid, varchar, pgTable, text, timestamp, pgEnum, unique, index, check } from 'drizzle-orm/pg-core';
import { roleEnum as ROLE_VALUES, organizationTypeEnum as ORGANIZATION_TYPES } from "../common/types/common.types"
//for enum values we use the following:
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const roleEnum = pgEnum('role', ROLE_VALUES);
export const methodEnum = pgEnum('method', ['device', 'card']);
export const organizationTypeEnum = pgEnum('organization_type', ORGANIZATION_TYPES);

// every timestamp stores the timezone, so time-window checks are never off by hours
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ------------
// Organizations (tenants)
//-------------
// One row per school / college using the app. Almost every other row belongs to one,
// and every query is scoped to the caller's organization, so schools never see each other's data.
export const organizations = pgTable('organizations', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    type: organizationTypeEnum('type').notNull().default('school'),
    // students type this (or open the join link) to sign up INTO this school. Admins can regenerate it.
    joinCode: varchar('join_code', { length: 16 }).notNull().unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ------------
// User Schema
//-------------

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    // which school this person belongs to. NULL only for `system` (the platform operator, above all schools).
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // varchar is used for fixed length of characters
    email: varchar('email', {length: 255}).notNull().unique(),
    // text is used for unbounded characters it can be multiple or lesser too.
    password: text('password_hash').notNull(),
    // enums are used for picking up values between specific outcomes.
    gender: genderEnum('gender').notNull().default('other'),
    role: roleEnum('role').notNull().default('users'),
    is_active: boolean('is_Active').notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
    index('users_organization_id_idx').on(table.organizationId),
    // the DB guarantees it: system users have no school, everyone else has exactly one
    check('users_organization_matches_role', sql`(${table.role} = 'system') = (${table.organizationId} is null)`),
]);

// ------------
// Refresh Tokens
//-------------
// one row per login (per device). login → insert, refresh → revoke old + insert new,
// logout → revoke. Only the sha256 hash is stored, never the token itself.
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  // deleting a user deletes their sessions too
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamptz('expires_at').notNull(),
  revokedAt: timestamptz('revoked_at'), // null = still usable
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

// ------------
// QR Credentials Schema
//-------------
// The token printed inside a student's QR card. Permanent until revoked
// (you can't change ink on plastic), so there is no expiry column.
export const credentials = pgTable("credentials",{
  id: uuid('id').defaultRandom().primaryKey(),
  // adding the foreign key in database schema
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  method: methodEnum('method').notNull().default('card'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  revokedAt: timestamptz('revoked_at'), // null = active. lost card → set this → issue a new one
});

// ------------
// Attendance - Sessions
//-------------
// A class/event. This is what expires: scans only count between opensAt and closesAt.
// "Closing" a session early just sets closesAt = now().
export const attendanceSessions = pgTable('attendance_sessions',{
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  openedBy: uuid('opened_by').notNull().references(()=> users.id),
  opensAt: timestamptz('opens_at').notNull().defaultNow(),
  closesAt: timestamptz('closes_at').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
}, (table) => [
  index('attendance_sessions_organization_id_idx').on(table.organizationId),
]);

// ------------
// Attendance - Records
//-------------
// One row = "this student checked in to this session".
export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => attendanceSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  credentialId: uuid('credential_id').notNull().references(() => credentials.id), // which card was used
  scannedBy: uuid('scanned_by').notNull().references(() => users.id), // the teacher/admin at the scanner
  scannedAt: timestamptz('scanned_at').notNull().defaultNow(),
}, (table) => [
  // a student can check in to a session only ONCE. The DB enforces it, so even two
  // scans arriving at the exact same millisecond can't create a duplicate.
  unique('attendance_records_session_user_unique').on(table.sessionId, table.userId),
]);
