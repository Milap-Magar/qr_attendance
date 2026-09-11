import { z } from "zod";

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

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
