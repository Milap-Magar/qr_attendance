import type { FastifyReply, FastifyRequest } from "fastify";

// Put this FIRST in `preHandler` on every protected route.
// Reads `Authorization: Bearer <accessToken>`, checks the signature and expiry,
// then sets `request.user = { userId, role }`.
//
// 401 tells the frontend: "call POST /api/auth/refresh, then retry".
// If the refresh also fails → send the user to the login page.
export const authMiddleware = async ( request: FastifyRequest, reply: FastifyReply) =>{
    try{
        await request.jwtVerify();
    }catch(error){
        return reply.status(401).send({
            message: 'Invalid or expired token',
            code: 'UNAUTHORIZED',
        })
    }
}
