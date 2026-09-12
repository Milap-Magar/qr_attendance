import { z } from "zod";
import { genderEnum } from "../../common/types/common.types";

// Roll numbers are text, not a number: "7", "07" and "2026/007" are all real, and a school
// that writes "07" wants "07" back on the card.
export const rollNoSchema = z.string().trim().min(1, "Roll number is required").max(32);
export const studentNameSchema = z.string().trim().min(1, "Name is required").max(255);

// POST /api/students — add one student to a class. A QR card is issued at the same time.
export const createStudentSchema = z.object({
    classId: z.uuid(),
    rollNo: rollNoSchema,
    name: studentNameSchema,
    gender: z.enum(genderEnum).default("other"),
});

// One row of a CSV import. Same rules as a single add, minus classId (the whole file
// goes into one class), so a file that imports cleanly matches what the form would accept.
export const importStudentRowSchema = z.object({
    rollNo: rollNoSchema,
    name: studentNameSchema,
    gender: z.enum(genderEnum).default("other"),
});

// POST /api/students/import — the parsed rows of a CSV, for ONE class.
// The frontend parses the file (so the user sees a preview and can fix typos first) and posts JSON.
export const importStudentsSchema = z.object({
    classId: z.uuid(),
    rows: z.array(importStudentRowSchema)
        .min(1, "Add at least one student")
        // a whole school in one request would time out and lock the table; one class at a time
        .max(500, "Import at most 500 students at a time"),
});

// PATCH /api/students/:id — send only what changed. `classId` moves a student to another class.
export const updateStudentSchema = z.object({
    name: studentNameSchema.optional(),
    rollNo: rollNoSchema.optional(),
    gender: z.enum(genderEnum).optional(),
    classId: z.uuid().optional(),
    isActive: z.boolean().optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Send at least one field to update",
});

// GET /api/students?classId=...&q=ram&includeInactive=true
export const listStudentsQuerySchema = z.object({
    classId: z.uuid().optional(),
    q: z.string().trim().max(255).optional(), // matches name or roll number
    includeInactive: z.stringbool().default(false),
});

// POST /api/classes/:id/cards — whose cards to issue.
//   "missing" (default) → only students without a working card. Re-running is then safe.
//   "all"               → every student, which REVOKES every card already in their hands.
export const issueClassCardsSchema = z.object({
    only: z.enum(["missing", "all"]).default("missing"),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type ImportStudentRow = z.infer<typeof importStudentRowSchema>;
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
