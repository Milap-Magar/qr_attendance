import type { FastifyPluginAsync } from "fastify";
import { authMiddleware, orgIdOf } from "../auth/auth.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { idParamSchema } from "../../common/types/common.types";
import { attendanceServices } from "./attendance.services";
import { createSessionSchema } from "./attendance.types";

export const attendanceRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/attendance/sessions — open a class for scanning
  fastify.post("/sessions", {
    preHandler: [authMiddleware, requirePermission("sessions:manage")],
  }, async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    const session = await attendanceServices.createSession(body, request.user.userId, orgIdOf(request));
    return reply.status(201).send(session);
  });

  // GET /api/attendance/sessions — my school's sessions, newest first, with status + checkedInCount
  fastify.get("/sessions", {
    preHandler: [authMiddleware, requirePermission("sessions:manage")],
  }, async (request, reply) => {
    return reply.send(await attendanceServices.listSessions(orgIdOf(request)));
  });

  // GET /api/attendance/sessions/:id
  fastify.get("/sessions/:id", {
    preHandler: [authMiddleware, requirePermission("sessions:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await attendanceServices.getSession(id, orgIdOf(request)));
  });

  // PATCH /api/attendance/sessions/:id/close — stop accepting scans now
  fastify.patch("/sessions/:id/close", {
    preHandler: [authMiddleware, requirePermission("sessions:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await attendanceServices.closeSession(id, orgIdOf(request)));
  });

  // GET /api/attendance/sessions/:id/records — who checked in (admin only by default)
  fastify.get("/sessions/:id/records", {
    preHandler: [authMiddleware, requirePermission("reports:read")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await attendanceServices.getSessionRecords(id, orgIdOf(request)));
  });

  // GET /api/attendance/me — the logged-in student's own history
  fastify.get("/me", {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    return reply.send(await attendanceServices.getMyAttendance(request.user.userId));
  });
};
