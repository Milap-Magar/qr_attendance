import { sql } from 'drizzle-orm';
import { boolean, date, uuid, varchar, pgTable, text, timestamp, pgEnum, unique, index, check } from 'drizzle-orm/pg-core';
import { roleEnum as ROLE_VALUES, organizationTypeEnum as ORGANIZATION_TYPES } from "../common/types/common.types"
//for enum values we use the following:
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const roleEnum = pgEnum('role', ROLE_VALUES);
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
    // IANA name, e.g. "Asia/Kathmandu". Decides where one school DAY starts and ends, which is what
    // "a student is present once per day" means. Kept per school so one deployment can serve several.
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ------------
// User Schema
//-------------
// STAFF ONLY: admins, teachers, and the platform operator. These are the people who log in.
// Students are NOT users — they never log in, they just hold up a QR card. See `students` below.

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
// Classes
//-------------
// One row per class a school teaches this year, e.g. Grade 10 / Section A / 2026.
// Grade and section are separate so you can list all of Grade 10 at once, and academicYear
// means next year's "Grade 10 A" is a different row — last year's roster stays intact.
export const classes = pgTable('classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  grade: varchar('grade', { length: 32 }).notNull(),   // "10", "Nursery", "BSc CS 3rd Sem"
  // '' (not null) when a grade isn't split into sections — NULL would let the unique index
  // below accept the same class twice, because NULL never equals NULL.
  section: varchar('section', { length: 32 }).notNull().default(''),
  academicYear: varchar('academic_year', { length: 16 }).notNull(), // "2026" or "2026-27"
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('classes_organization_id_idx').on(table.organizationId),
  unique('classes_org_grade_section_year_unique').on(table.organizationId, table.grade, table.section, table.academicYear),
]);

// ------------
// Students
//-------------
// A roster entry, NOT a login. A school adds these in bulk (one class at a time) and each one
// gets exactly one permanent QR card. `organizationId` is duplicated from the class on purpose:
// every scan query filters by school, and doing that without a join keeps the hot path cheap.
export const students = pgTable('students', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'restrict' }),
  rollNo: varchar('roll_no', { length: 32 }).notNull(),
  name: text('name').notNull(),
  gender: genderEnum('gender').notNull().default('other'),
  // a student who left mid-year: keep the history, stop counting them as absent every day
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('students_organization_id_idx').on(table.organizationId),
  index('students_class_id_idx').on(table.classId),
  // roll numbers repeat across classes (every class has a "1"), but never inside one
  unique('students_class_roll_no_unique').on(table.classId, table.rollNo),
]);

// ------------
// QR Credentials Schema
//-------------
// The token printed inside a student's QR card. Permanent until revoked
// (you can't change ink on plastic), so there is no expiry column.
//
// Only the sha256 hash is stored, so the token itself is shown exactly ONCE — when the card is
// issued. Reprinting a lost card means issuing a new one, which revokes the old.
export const credentials = pgTable("credentials",{
  id: uuid('id').defaultRandom().primaryKey(),
  // adding the foreign key in database schema
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  revokedAt: timestamptz('revoked_at'), // null = active. lost card → set this → issue a new one
}, (table) => [
  index('credentials_student_id_idx').on(table.studentId),
]);

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
// One row = "this student was present on this day". Attendance is counted PER DAY, not per session:
// the first scan into any open session marks the student present, and every later scan that day —
// even in a different session — is a no-op that reports "already marked present today".
//
// `sessionId` records which session the scan happened in, for context. `attendanceDate` is the
// school's local calendar day (see organizations.timezone), computed by the SERVER, never sent by
// the scanner laptop — a laptop clock can be wrong or deliberately set back.
export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => attendanceSessions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  credentialId: uuid('credential_id').notNull().references(() => credentials.id, { onDelete: 'cascade' }), // which card was used
  scannedBy: uuid('scanned_by').notNull().references(() => users.id), // the teacher/admin at the scanner
  // mode: 'string' → "2026-09-12" in and out, never a Date that a timezone could shift by a day
  attendanceDate: date('attendance_date', { mode: 'string' }).notNull(),
  scannedAt: timestamptz('scanned_at').notNull().defaultNow(),
}, (table) => [
  // THE rule: one presence per student per day. The DB enforces it, so even two scanner laptops
  // hitting the API in the same millisecond can't create a duplicate.
  unique('attendance_records_student_date_unique').on(table.studentId, table.attendanceDate),
  index('attendance_records_session_id_idx').on(table.sessionId),
  index('attendance_records_date_idx').on(table.attendanceDate),
]);
