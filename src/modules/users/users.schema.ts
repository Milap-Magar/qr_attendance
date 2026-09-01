import { boolean, uuid, varchar, pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

//for enum values we use the following:
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const roleEnum = pgEnum('role', ['system', 'admin', 'teachers', 'users']);

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // varchar is used for fixed length of characters
    email: varchar('email', {length: 255}).notNull().unique(),
    // text is used for unbounded characters it can be multiple or lesser too.
    passwordHash: text('password_hash').notNull(),
    // enums are used for picking up values between specific outcomes.
    gender: genderEnum('gender').notNull().default('other'),
    role: roleEnum('role').notNull().default('users'),
    isActive: boolean('is_Active').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});