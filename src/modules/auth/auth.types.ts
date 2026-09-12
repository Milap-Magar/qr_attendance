import z from "zod";
import { genderEnum, organizationTypeEnum } from "../../common/types/common.types";
import { organizationNameSchema } from "../organizations/organization.types";

// shared email rule: trims spaces and lowercases, so "Ram@X.com " and "ram@x.com" are the same account
// (phone keyboards love capitalising the first letter)
export const emailSchema = z.email({
    error: (issue) =>
    issue.input === undefined || issue.input == "" ? "Email is required" : "Invalid Email format"
}).trim().toLowerCase();

// strength rule — only checked when a password is CREATED (register / admin creates user)
export const passwordSchema = z.string().regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/,
                    "Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number, and special character.");

// There is no student sign-up schema: students never have accounts. They are roster rows
// their school adds (see modules/students), identified by a permanent QR card.

// POST /api/auth/register-school — a new school signs up; the person signing up becomes its first admin.
// Flat (not { school: {...}, admin: {...} }) so every field error maps straight onto a form input.
export const registerSchoolSchema = z.object({
    schoolName: organizationNameSchema,
    schoolType: z.enum(organizationTypeEnum).default("school"),
    name: z.string().trim().min(3).max(255),
    email: emailSchema,
    password: passwordSchema,
    gender: z.enum(genderEnum).default("other"),
})


// login user schema design
export const loginUserSchema = z.object({
    email: emailSchema,
    // NOT the strength regex: login only compares against the stored hash.
    // (if the rules ever change, old passwords must still be able to log in)
    password: z.string().min(1, "Password is required"),
})

// body of POST /refresh and POST /logout
export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, "refreshToken is required"),
})

export type registerSchoolTypes = z.infer<typeof registerSchoolSchema>;
export type loginUserTypes = z.infer<typeof loginUserSchema>;
