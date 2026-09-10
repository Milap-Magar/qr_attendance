import { eq } from "drizzle-orm"
import { users } from "../../db/schema"
import { db } from "../../db"

    export const rbacServices = {

    // find user by id for checking the role
    async findById(id :string) {
        const [data] = await  db.select().from(users).where(eq(users.id , id));
        if(data?.id){
            return {
                status: 200,
                message: "Data reterived",
                data: data
            };
        }else{
            return {
                status: 404,
                message : "User not found!"
            }
        }
    },
}