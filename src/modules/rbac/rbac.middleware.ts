import type { FastifyReply, FastifyRequest } from "fastify";
import { rbacServices } from "./rbac.service";
import type { Permission, Role } from "./rbac.types";


// requires permission
// NOT async: this runs once at route setup and must RETURN the hook function
export const requirePermission = (...required: Permission[]) =>
    //routes asking for permission
    async (request: FastifyRequest, reply: FastifyReply) => {
        const { role } = request.user; // set by authMiddleware → must run first

        const allowed = required.every((p) => rbacServices.roleHasPermission(role, p));
        if(!allowed){
            return reply.status(403).send({ message: "Forbidden" });
        }
    };

// excape hatch
export const requireRole = (...roles: Role[]) =>
    async(request: FastifyRequest, reply: FastifyReply)=>{
        if(!roles.includes(request.user.role)) {
            return reply.status(403).send({
                message: "Forbidden"
            })
        }
    }
