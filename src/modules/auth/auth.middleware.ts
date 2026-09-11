import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../common/errors";

// Put this FIRST in `preHandler` on every protected route.
// Reads `Authorization: Bearer <accessToken>`, checks the signature and expiry,
// then sets `request.user = { userId, role, orgId }`.
//
// 401 tells the frontend: "call POST /api/auth/refresh, then retry".
// If the refresh also fails → send the user to the login page.
export const authMiddleware = async ( request: FastifyRequest, reply: FastifyReply) =>{
    try{
        await request.jwtVerify();
        // tokens signed before schools existed have no orgId → make the frontend refresh for a new one
        if (request.user.orgId === undefined) throw new Error("token has no orgId");
    }catch(error){
        return reply.status(401).send({
            message: 'Invalid or expired token',
            code: 'UNAUTHORIZED',
        })
    }
}

// The caller's school. Use in every route that reads or writes school data.
// Only `system` has none, and the RBAC policy gives system no school permissions,
// so this 403 is a safety net, not something a normal user sees.
export function orgIdOf(request: FastifyRequest): string {
    const { orgId } = request.user;
    if (!orgId) throw new AppError(403, "This account doesn't belong to a school", "NO_ORGANIZATION");
    return orgId;
}
