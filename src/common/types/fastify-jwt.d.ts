import "@fastify/jwt";
import type { Role } from "./common.types";

// tells @fastify/jwt what we sign, so request.user is typed everywhere (no more `as` casts)
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; role: Role }; // what fastify.jwt.sign() accepts
    user: { userId: string; role: Role };    // what request.user is after jwtVerify()
  }
}
