import { z } from "zod";
import { genderEnum, roleEnum } from "../../common/types/common.types";


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
    role: z.enum(roleEnum).default("user"),
})

export const updateUserSchema = z.object({
    id: z.string().nonempty(),
    name: z.string().min(3).max(255),
})

// exporting the user infered schema as fastify requires proper json as if ajv
export type CreateUserType = z.infer<typeof createUserSchemas>;
export type UpdateUserType = z.infer<typeof updateUserSchema>;
