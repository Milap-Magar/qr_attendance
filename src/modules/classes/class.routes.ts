import type { FastifyPluginAsync } from "fastify";
import { authMiddleware, orgIdOf } from "../auth/auth.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { idParamSchema } from "../../common/types/common.types";
import { classServices } from "./class.services";
import { createClassSchema, listClassesQuerySchema, updateClassSchema } from "./class.types";
import { studentServices } from "../students/student.services";
import { qrServices } from "../qr/qr.services";
import { issueClassCardsSchema } from "../students/student.types";

// A school's classes. Everything here is scoped to the caller's own school.
export const classRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/classes?academicYear=2026&grade=10 — with a live student count on each
  fastify.get("/", {
    preHandler: [authMiddleware, requirePermission("classes:read")],
  }, async (request, reply) => {
    const filters = listClassesQuerySchema.parse(request.query);
    return reply.send(await classServices.list(orgIdOf(request), filters));
  });

  // GET /api/classes/academic-years — which years this school has classes for (the year picker)
  fastify.get("/academic-years", {
    preHandler: [authMiddleware, requirePermission("classes:read")],
  }, async (request, reply) => {
    return reply.send(await classServices.academicYears(orgIdOf(request)));
  });

  // POST /api/classes — { grade, section?, academicYear }
  fastify.post("/", {
    preHandler: [authMiddleware, requirePermission("classes:manage")],
  }, async (request, reply) => {
    const body = createClassSchema.parse(request.body);
    return reply.status(201).send(await classServices.create(body, orgIdOf(request)));
  });

  // GET /api/classes/:id
  fastify.get("/:id", {
    preHandler: [authMiddleware, requirePermission("classes:read")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await classServices.getById(id, orgIdOf(request)));
  });

  // GET /api/classes/:id/students — the roster, in roll-number order, each with its card status
  fastify.get("/:id/students", {
    preHandler: [authMiddleware, requirePermission("students:read")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await studentServices.listByClass(id, orgIdOf(request)));
  });

  // POST /api/classes/:id/cards — issue printable QR cards for a whole class AT ONCE.
  // The plain tokens come back here and NOWHERE else, ever: only their hash is stored.
  // Print the response before closing the page.
  //
  // Default `only: "missing"` skips students who already hold a working card, so re-running
  // this doesn't silently kill cards that are already in students' hands.
  fastify.post("/:id/cards", {
    preHandler: [authMiddleware, requirePermission("credentials:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { only } = issueClassCardsSchema.parse(request.body ?? {});
    return reply.status(201).send(await qrServices.issueClassCards(id, orgIdOf(request), only));
  });

  // PATCH /api/classes/:id
  fastify.patch("/:id", {
    preHandler: [authMiddleware, requirePermission("classes:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateClassSchema.parse(request.body);
    return reply.send(await classServices.update(id, orgIdOf(request), body));
  });

  // DELETE /api/classes/:id — only when the class is empty (409 otherwise)
  fastify.delete("/:id", {
    preHandler: [authMiddleware, requirePermission("classes:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await classServices.remove(id, orgIdOf(request)));
  });
};
