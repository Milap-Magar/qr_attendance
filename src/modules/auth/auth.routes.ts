// these are bascially for routing.
// also known as - a signal that shows the road
//
// HOW THE TWO TOKENS WORK
//   accessToken  — JWT, lives 15 min. Send it on every request: `Authorization: Bearer <accessToken>`
//   refreshToken — random string, lives 7 days. Only ever sent to POST /api/auth/refresh.
//
//   login ──▶ { accessToken, refreshToken }
//   ...15 min later an API call returns 401...
//   POST /refresh { refreshToken } ──▶ NEW { accessToken, refreshToken }  (old refresh token is now dead)
//   retry the API call with the new accessToken
//   logout ──▶ POST /logout { refreshToken }  (kills it on the server)

import { type FastifyPluginAsync } from "fastify";
import { authServices } from './auth.services';
import { loginUserSchema, refreshTokenSchema, registerSchoolSchema } from './auth.types';
import type { Role } from "../../common/types/common.types";

export const authRoutes : FastifyPluginAsync = async (fastify) => {

    const signAccessToken = (user: { id: string; role: Role; organizationId: string | null }) =>
        fastify.jwt.sign({ userId: user.id, role: user.role, orgId: user.organizationId });

    // signs the JWT (access token) + stores a new refresh token
    async function issueTokens(user: { id: string; role: Role; organizationId: string | null }) {
        const accessToken = signAccessToken(user);
        const refreshToken = await authServices.createRefreshToken(user.id);
        return { accessToken, refreshToken };
    }

    // POST /api/auth/register-school — a school/college signs up. The caller becomes its admin, logged in.
    fastify.post("/register-school", async(request, reply) => {
        const body = registerSchoolSchema.parse(request.body);
        const { user, organization } = await authServices.registerSchool(body);
        const tokens = await issueTokens(user);
        return reply.status(201).send({ message: "School created", user, organization, ...tokens });
    })

    // There is no student sign-up. Students are roster entries added by their school
    // (POST /api/students), never accounts — they hold up a QR card instead of logging in.
    // Staff accounts are created by a school admin through POST /api/users.

    // POST /api/auth/login
    fastify.post("/login",  async (request, reply) => {
        const body = loginUserSchema.parse(request.body);
        const user = await authServices.login(body);
        const tokens = await issueTokens(user);
        return reply.status(200).send({ message: "Login Successfull", user, ...tokens });
    })

    // POST /api/auth/refresh — trade a refresh token for a new pair of tokens
    fastify.post("/refresh", async (request, reply) => {
        const { refreshToken } = refreshTokenSchema.parse(request.body);
        const { user, refreshToken: newRefreshToken } = await authServices.rotateRefreshToken(refreshToken);
        const accessToken = signAccessToken(user);
        return reply.status(200).send({ user, accessToken, refreshToken: newRefreshToken });
    })

    // POST /api/auth/logout — the access token still works until it expires (max 15 min),
    // so the frontend should also delete both tokens from its storage.
    fastify.post("/logout", async (request, reply) => {
        const { refreshToken } = refreshTokenSchema.parse(request.body);
        await authServices.revokeRefreshToken(refreshToken);
        return reply.status(204).send();
    })
}
