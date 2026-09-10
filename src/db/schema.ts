import { boolean, uuid, varchar, pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

//for enum values we use the following:
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const roleEnum = pgEnum('role', ['system', 'admin', 'teachers', 'users']);
export const methodEnum = pgEnum('method', ['device', 'card']);

// ------------
// User Schema 
//-------------

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // varchar is used for fixed length of characters
    email: varchar('email', {length: 255}).notNull().unique(),
    // text is used for unbounded characters it can be multiple or lesser too.
    password: text('password_hash').notNull(),
    // enums are used for picking up values between specific outcomes.
    gender: genderEnum('gender').notNull().default('other'),
    role: roleEnum('role').notNull().default('users'),
    is_active: boolean('is_Active').notNull().default(false),
    createdAt: timestamp("created_at", {
    withTimezone: true,
    })
    .notNull()
    .defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ------------
// Attendance - Sessions 
//-------------
export const attendance_sessions = pgTable('attendace_sessions',{
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  opened_by: uuid('user_id').notNull().references(()=> users.id),
  opens_at: timestamp('opens_at', {
    withTimezone: true,
  }).notNull()
    .defaultNow(),
  closes_at: timestamp('closes_at').notNull(),
  is_open: boolean('is_open').notNull().default(false),
});


// ------------
// QR Credentials Schema 
//-------------
export const credentials = pgTable("credentials",{
  id: uuid('id').defaultRandom().primaryKey(),
  // adding the foreign key in database schema
  user_id: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token').unique().notNull(),
  method: methodEnum('method').notNull(),
  scannedAt: timestamp('scanned_at').notNull().defaultNow(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    })
    .notNull()
    .defaultNow(),
  revoked_at: timestamp('revoked_at').notNull()
});
