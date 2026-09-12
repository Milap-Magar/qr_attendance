// Builds the Fastify app WITHOUT starting it.
//   index.ts  → buildApp() + listen()      (the real server)
//   tests     → buildApp() + app.inject()  (fake requests, no port needed)
import Fastify, { type FastifyServerOptions } from "fastify";
import fastifyJwt from "@fastify/jwt";
import cors from "@fastify/cors";
import { ZodError, z } from "zod";
import { config } from "./config";
import { AppError } from "./common/errors";
import { authRoutes } from "./modules/auth/auth.routes";
import { userRoutes } from "./modules/users/user.routes";
import { classRoutes } from "./modules/classes/class.routes";
import { studentRoutes } from "./modules/students/student.routes";
import { qrRoutes } from "./modules/qr/qr.routes";
import { attendanceRoutes } from "./modules/attendance/attendance.routes";
import { organizationRoutes } from "./modules/organizations/organization.routes";

export async function buildApp(options: FastifyServerOptions = { logger: true }) {
  const fastify = Fastify(options);

  // let the frontend (another origin, e.g. localhost:5173) call this API
  await fastify.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });

  // every token signed by fastify.jwt.sign() expires after ACCESS_TOKEN_TTL (15m by default)
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.accessTokenTtl },
  });

  // Fastify normally rejects `Content-Type: application/json` with an EMPTY body (400).
  // Frontends often send that header on every request, even PATCH /close with no body,
  // so treat an empty body as "no body" instead of an error.
  const defaultJsonParser = fastify.getDefaultJsonParser("error", "error");
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    if (body === "") return done(null, undefined);
    defaultJsonParser(request, body as string, done); // parseAs: "string" → always a string
  });

  // ONE place that turns thrown errors into JSON responses: { message, code, errors? }
  fastify.setErrorHandler((error, request, reply) => {
    // schema.parse() failed → 400 with the message per field, e.g. { email: ["Invalid Email format"] }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: error.issues[0]?.message ?? "Validation failed",
        code: "VALIDATION_ERROR",
        errors: z.flattenError(error).fieldErrors,
      });
    }
    // errors we threw on purpose
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message, code: error.code });
    }
    // Fastify's own 4xx errors (broken JSON, body too large, ...)
    const fastifyError = error as { statusCode?: number; code?: string; message: string };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({ message: fastifyError.message, code: fastifyError.code });
    }
    // a real bug: log the details, but don't leak them to the client
    request.log.error(error);
    return reply.status(500).send({ message: "Internal Server Error", code: "INTERNAL_ERROR" });
  });

  // Health check
  fastify.get("/health", async () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // API routes
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(userRoutes, { prefix: "/api/users" });
  await fastify.register(classRoutes, { prefix: "/api/classes" });
  await fastify.register(studentRoutes, { prefix: "/api/students" });
  await fastify.register(qrRoutes, { prefix: "/api/qr" });
  await fastify.register(attendanceRoutes, { prefix: "/api/attendance" });
  await fastify.register(organizationRoutes, { prefix: "/api/organizations" });

  return fastify;
}
