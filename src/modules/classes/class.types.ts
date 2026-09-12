import { z } from "zod";

// "10", "Nursery", "BSc CS 3rd Sem" — free text, because what a "grade" is called
// differs wildly between a school, a college and a university.
export const gradeSchema = z.string().trim().min(1, "Grade is required").max(32);

// "" means the grade isn't split into sections. Stored as '' rather than NULL so the
// unique index can actually catch a duplicate (NULL never equals NULL in Postgres).
export const sectionSchema = z.string().trim().max(32);

// "2026" or "2026-27". Kept as text: academic years are written differently per country
// and are only ever compared for equality or sorted as strings.
export const academicYearSchema = z.string().trim().min(4, "Academic year is required").max(16);

// POST /api/classes
export const createClassSchema = z.object({
    grade: gradeSchema,
    section: sectionSchema.default(""),
    academicYear: academicYearSchema,
});

// PATCH /api/classes/:id
export const updateClassSchema = z.object({
    grade: gradeSchema.optional(),
    section: sectionSchema.optional(),
    academicYear: academicYearSchema.optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Send at least one field to update",
});

// GET /api/classes?academicYear=2026&grade=10
export const listClassesQuerySchema = z.object({
    academicYear: academicYearSchema.optional(),
    grade: gradeSchema.optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
