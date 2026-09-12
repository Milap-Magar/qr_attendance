import { z } from "zod";

// A school day, "2026-09-12". Plain text, never a Date: a Date would be parsed as midnight UTC
// and could land on the day before once the browser's timezone is applied.
export const schoolDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-12");

// POST /api/attendance/sessions
// dates accept anything `new Date()` understands — send ISO strings: "2026-09-11T09:00:00.000Z"
export const createSessionSchema = z.object({
    title: z.string().trim().min(1, "title is required").max(255),
    opensAt: z.coerce.date().optional(), // default: now
    closesAt: z.coerce.date(),
}).refine((s) => s.closesAt > (s.opensAt ?? new Date()), {
    message: "closesAt must be after opensAt",
    path: ["closesAt"],
})

// GET /api/attendance/register?classId=...&date=2026-09-12
// One class's full roster for one day, present and absent. `date` defaults to the school's today.
export const dailyReportQuerySchema = z.object({
    classId: z.uuid(),
    date: schoolDateSchema.optional(),
})

// GET /api/attendance/summary?date=2026-09-12 — every class's tally for one day
export const dailySummaryQuerySchema = z.object({
    date: schoolDateSchema.optional(),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;
