import { pgTable, timestamp, uuid} from "drizzle-orm/pg-core";
import { users } from "../users/users.schema";

export const attendanceLogs = pgTable("attendance_logs", {
    // id
    id: uuid('id').defaultRandom().primaryKey(),

    // user id
    userId: uuid('user_Id').notNull().references(() => users.id),

    // scanned at
    scannedAt: timestamp('scanned_At').notNull().defaultNow(),
});