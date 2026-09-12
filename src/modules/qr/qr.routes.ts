import type { FastifyPluginAsync } from "fastify";
import { authMiddleware, orgIdOf } from "../auth/auth.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { idParamSchema } from "../../common/types/common.types";
import { qrServices } from "./qr.services";
import { issueCredentialSchema, listCredentialsQuerySchema, scanSchema } from "./qr.types";

// Flow:
//   1. office: add a class, then its students   → every student gets a permanent QR card at once
//                                                 (POST /api/students, /api/students/import)
//      reprint a whole class                    → POST /api/classes/:id/cards
//      reprint ONE lost card                    → POST /api/qr/credentials { studentId }
//   2. teacher: POST /api/attendance/sessions   → opens a window for scanning
//   3. scanner laptop reads a card: POST /api/qr/scan { sessionId, token }
//                                                 → student name + class, marked present for today
export const qrRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/qr/credentials — re-issue ONE student's card. The card they had stops working.
  // Responds with the plain `token`, the only time it is readable.
  fastify.post("/credentials", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { studentId } = issueCredentialSchema.parse(request.body);
    const credential = await qrServices.issueCredential(studentId, orgIdOf(request));
    return reply.status(201).send(credential);
  });

  // GET /api/qr/credentials?studentId=... — card history (never includes the token)
  fastify.get("/credentials", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { studentId } = listCredentialsQuerySchema.parse(request.query);
    return reply.send(await qrServices.listCredentials(orgIdOf(request), studentId));
  });

  // PATCH /api/qr/credentials/:id/revoke — lost card, with no replacement printed yet
  fastify.patch("/credentials/:id/revoke", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await qrServices.revokeCredential(id, orgIdOf(request)));
  });

  // POST /api/qr/scan — the scanner laptop. The JWT here belongs to the teacher/admin
  // running the scanner, NOT the student (the student just shows a card).
  fastify.post("/scan", {
    preHandler: [authMiddleware, requirePermission("attendance:scan")],
  }, async (request, reply) => {
    const body = scanSchema.parse(request.body);
    const result = await qrServices.scan(body, request.user.userId, orgIdOf(request));
    return reply.status(201).send(result);
  });
};
