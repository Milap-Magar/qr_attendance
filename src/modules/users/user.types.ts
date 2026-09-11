import { z } from "zod";
import { genderEnum, roleEnum, type Role } from "../../common/types/common.types";

// roles a school can give its own people. `system` (platform operator) is only made from the CLI.
export const schoolRoleEnum = ["admin", "teachers", "users"] as const;
import { emailSchema, passwordSchema } from "../auth/auth.types";

// POST /api/users — a school admin adds someone to THEIR school (can pick the role)
export const createUserSchemas = z.object({
    name: z.string().trim().min(3).max(255),
    email: emailSchema,
    password: passwordSchema,
    gender: z.enum(genderEnum).default("other"),
    role: z.enum(schoolRoleEnum).default("users"),
})

// PATCH /api/users/:id — every field optional, send only what changed.
// role is NOT here on purpose: nobody changes roles through a profile edit.
export const updateUserSchema = z.object({
    name: z.string().trim().min(3).max(255).optional(),
    gender: z.enum(genderEnum).optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    // an empty {} would reach the DB as an UPDATE with nothing to set → 500
    message: "Send at least one field to update",
})

// GET /api/users?role=users — optional filter (e.g. list only students)
export const listUsersQuerySchema = z.object({
    role: z.enum(roleEnum).optional(),
})

// exporting the user infered schema as fastify requires proper json as if ajv
export type CreateUserType = z.infer<typeof createUserSchemas>;
// what userServices.addUsers() accepts: any role, including `system` (the CLI script needs that)
export type NewUserType = Omit<CreateUserType, "role"> & { role: Role };
export type UpdateUserType = z.infer<typeof updateUserSchema>;
