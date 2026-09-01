import { integer, boolean, pgTable, uuid, timestamp, text } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

const qrCredentials = pgTable('qr_credentials', {
    // id
    id: uuid("id").defaultRandom().primaryKey(),

    // userID
    userId: uuid("user_id").notNull().references(() => users.id),

    // token hash
    tokenHash: text("token_hash").notNull().unique(),

    // isActive
    isActive: boolean("is_Active").notNull().default(true),

    // createdAt
    createdAt: timestamp("created_at").notNull().defaultNow(),

    // revokedAt
    revokedAt: timestamp("revoed_at"),
})

