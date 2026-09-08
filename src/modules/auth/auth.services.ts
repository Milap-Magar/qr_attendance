import { eq } from "drizzle-orm"
import { db } from "../../db"
import { users } from "../../db/schema"
import type { loginUserTypes, registerUserTypes } from "./auth.types";
import bcrypt, { genSalt } from 'bcryptjs';

export const authServices = {
    //login services
    async login(user: loginUserTypes){
        // destructuring the datasets
        const {email, password} = user;
        // select the user from the database via email
        // adding [] brackets gives either 1 response data or 0 (non).
        const [data] = await db.select().from(users).where(eq(users.email, email));
        // if user exists then
        if(data?.email){
            const passwordDB = data.password; 
            // check || compare hashed password
            const isValid = await bcrypt.compare(password , passwordDB);
            // check for the password for now just normal password
            if(isValid){
                return {
                    status: 200,
                    data: {
                        id: data.id,
                        role: data.role,
                    },
                };
            }else{
                return {
                    status: 401,
                    message: "password incorrect",
                };
            }
        }else{
            return {
                status: 404,
                message: "Email not found"
            }
        }
    },

    // register services
    async register(user: registerUserTypes ){
        // destructuring the datasets
        const { email, password } = user; 
        // check whether the email exists or not?
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));
        // check weather user exists or not.
        if(existingUser){
            return "User Exists!!";
        }
        // hash the password here so that easier inorder to use
        const salt = await genSalt(10);
        const hash = await bcrypt.hash(password, salt); 
        // insert data if user doesnot exist && hashed values aswell
        const newUser = await db.insert(users).values({...user, password: hash}).returning();
        // returning gives data in array so no need to keep those brackets.
        return newUser;
    },

}   