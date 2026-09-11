import "@fastify/jwt";
import type { Role } from "./common.types";

// what we put inside every access token. `orgId` = the user's school (null for `system`, the platform operator),
// so scoping a query to "my school" never needs an extra DB lookup.
type TokenPayload = { userId: string; role: Role; orgId: string | null };

// tells @fastify/jwt what we sign, so request.user is typed everywhere (no more `as` casts)
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload; // what fastify.jwt.sign() accepts
    user: TokenPayload;    // what request.user is after jwtVerify()
  }
}
