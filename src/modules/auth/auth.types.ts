import z, { email } from "zod";
import { genderEnum } from "../../common/types/common.types";


// register user schema design
export const registerUserSchema = z.object({
    name: z.string().min(3).max(255).nonempty(),

    email: z.email({
        error: (issue) => 
        issue.input === undefined || issue.input == "" ? "Email is required" : "Invalid Email format" 
    }),

    password: z.string().regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/,
                    "Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number, and special character."),
    
    gender: z.enum(genderEnum).default("other"),
})


// login user schema design
export const loginUserSchema = z.object({
    email: z.email({
        error: (issue) => 
        issue.input === undefined || issue.input == "" ? "Email is required" : "Invalid Email format" 
    }),
    
    password: z.string().regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/,
                  "Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number, and special character."),
    
})

export type registerUserTypes = z.infer<typeof registerUserSchema>;
export type loginUserTypes = z.infer<typeof loginUserSchema>;
