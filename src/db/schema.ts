import { boolean, uuid, varchar, pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';


//for enum values we use the following:
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const roleEnum = pgEnum('role', ['system', 'admin', 'teachers', 'users']);

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
// Attendance Schema 
//-------------

export const attendanceLogs = pgTable("attendance_logs", {
    // id
    id: uuid('id').defaultRandom().primaryKey(),

    // user id
    userId: uuid('user_id').notNull().references(() => users.id),

    // scanned at
    scannedAt: timestamp('scanned_at').notNull().defaultNow(),

});

// ------------
// QR Credentials Schema 
//-------------

export const qrCredentials = pgTable("qr_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  tokenHash: text("token_hash")
    .notNull()
    .unique(),

  isActive: boolean("is_active")
    .notNull()
    .default(true),

    createdAt: timestamp("created_at", {
    withTimezone: true,
    })
    .notNull()
    .defaultNow(),

  revokedAt: timestamp("revoked_at"),
});
