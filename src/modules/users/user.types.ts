import { z } from "zod";


// defining enums - using as const because it might not infer the exact values of each elements of arrays of values:
const genderEnum = ["male", "female", "other"] as const;

export const createUserSchemas = z.object({
    name: z.string().min(3).max(255),

    // email, passwordHash, gender, role, isActive:
    email: z.email({
        error: (issue) => 
            issue.input === undefined || issue.input === "" 
        ? "Email is required" : 
        "Invalid Email Format",
    }),

    password: z.string().min(8),

    gender: z.enum(genderEnum).default("other"),
})

export const updateUserSchema = z.object({
    id: z.string().nonempty(),
    name: z.string().min(3).max(255),
})

// exporting the user infered schema as fastify requires proper json as if ajv
export type CreateUserType = z.infer<typeof createUserSchemas>;
export type UpdateUserType = z.infer<typeof updateUserSchema>;
