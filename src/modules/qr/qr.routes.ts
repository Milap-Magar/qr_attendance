import type { FastifyPluginAsync } from "fastify";
import { authMiddleware } from "../auth/auth.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { idParamSchema } from "../../common/types/common.types";
import { qrServices } from "./qr.services";
import { issueCredentialSchema, listCredentialsQuerySchema, scanSchema } from "./qr.types";

// Flow:
//   1. admin: POST /api/qr/credentials { userId }  → { token }  → print token as a QR on the ID card
//   2. teacher: POST /api/attendance/sessions      → opens a class for scanning
//   3. scanner laptop reads a card: POST /api/qr/scan { sessionId, token } → student name
export const qrRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/qr/credentials — issue (or re-issue) a student's QR card
  fastify.post("/credentials", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { userId } = issueCredentialSchema.parse(request.body);
    const credential = await qrServices.issueCredential(userId);
    return reply.status(201).send(credential);
  });

  // GET /api/qr/credentials?userId=... — card history (never includes the token)
  fastify.get("/credentials", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { userId } = listCredentialsQuerySchema.parse(request.query);
    return reply.send(await qrServices.listCredentials(userId));
  });

  // PATCH /api/qr/credentials/:id/revoke — lost card
  fastify.patch("/credentials/:id/revoke", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await qrServices.revokeCredential(id));
  });

  // POST /api/qr/scan — the scanner laptop. The JWT here belongs to the teacher/admin
  // running the scanner, NOT the student (the student just shows a card).
  fastify.post("/scan", {
    preHandler: [authMiddleware, requirePermission("attendance:scan")],
  }, async (request, reply) => {
    const body = scanSchema.parse(request.body);
    const result = await qrServices.scan(body, request.user.userId);
    return reply.status(201).send(result);
  });
};
