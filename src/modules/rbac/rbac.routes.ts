import type { FastifyPluginAsync } from "fastify";
import { rbacServices } from "./rbac.service";
import { authMiddleware } from "../auth/auth.middleware";

export const rbacRoutes: FastifyPluginAsync = async(fastify) => {

    // fetch role for rbac
    fastify.get("/", {
        preHandler: authMiddleware
    }, async(request, reply) => {
        const { userId } = request.user as {userId: string}; 
        const data = await rbacServices.findById(userId);
        if(data.status === 200){
            return reply.status(data.status).send({
                message: data.message,
                role: data.data?.role
            })
        }else {
            return reply.status(data.status).send({
                status: data.status,
                message: data.message
            })
        }
    })
}