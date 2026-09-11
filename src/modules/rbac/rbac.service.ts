import { eq } from "drizzle-orm"
import { users } from "../../db/schema"
import { db } from "../../db"
import type { Permission, Role } from "./rbac.types";
import { rolePermission } from "./rbac.constants";

export const rbacServices = {
    // find user by id for checking the role
    async getUserRole(id :string) {
        const [data] = await  db.select({ role: users.role }).from(users).where(eq(users.id , id));
        if(data?.role){
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

    // pure policy check — no DB. Takes a ROLE (read from the JWT).
    roleHasPermission(role: Role, permission: Permission) {
        return rolePermission[role].includes(permission);
    },

    // everything a role can do — sent to the frontend so it can hide buttons
    permissionsFor(role: Role) {
        return rolePermission[role];
    },

    // fresh check — hits the DB. Takes a USER ID. Use only on sensitive routes,
    // where a demoted user's old JWT must not still work.
    async userHasPermission(userId: string, permission: Permission) {
        const result = await rbacServices.getUserRole(userId);

        if(result.status !== 200 || !result.data){
          return false;
        }

        return rbacServices.roleHasPermission(result.data.role, permission);
    },
}
