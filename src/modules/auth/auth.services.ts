import { email } from 'zod';
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { users } from "../../db/schema"
import type { loginUserTypes, registerUserTypes } from "./auth.types";

export const authServices = {
    //login services
    async login(user: loginUserTypes){
        // destructuring the datasets
        const {email, passwordHash} = user;
        // select the user from the database via email
        // adding [] brackets gives either 1 response data or 0 (non).
        const [data] = await db.select().from(users).where(eq(users.email, email));
        // if user exists then
        if(data?.email){
            // check for the password for now just normal password
            if(data.passwordHash === passwordHash){
                return "wollahhh you are INNNN!!";
            }else{
                return "password incorrect";
            }
        }else{
            return "Email not found"
        }
    },

    // register services
    async register(user: registerUserTypes ){
        // destructuring the datasets
        const { email } = user; 
        // check whether the email exists or not?
        const [existingUser] = await db.select().from(users).where(eq(users.email, email));
        // check weather user exists or not.
        if(existingUser){
            return "User Exists!!";
        }
        // insert data if user doesnot exist
        const newUser = await db.insert(users).values(user).returning();
        // returning gives data in array so no need to keep those brackets.
        return newUser;
    },

}   