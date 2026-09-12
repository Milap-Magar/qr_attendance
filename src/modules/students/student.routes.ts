import type { FastifyPluginAsync } from "fastify";
import { authMiddleware, orgIdOf } from "../auth/auth.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { idParamSchema } from "../../common/types/common.types";
import { studentServices } from "./student.services";
import { createStudentSchema, importStudentsSchema, listStudentsQuerySchema, updateStudentSchema } from "./student.types";

// Students are roster entries, not accounts — nobody here ever logs in.
// Adding one issues its QR card in the same breath, because a student without a card
// can't be marked present, and that is the only thing a student row is for.
export const studentRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/students?classId=...&q=ram&includeInactive=true
  fastify.get("/", {
    preHandler: [authMiddleware, requirePermission("students:read")],
  }, async (request, reply) => {
    const filters = listStudentsQuerySchema.parse(request.query);
    return reply.send(await studentServices.list(orgIdOf(request), filters));
  });

  // POST /api/students — add one student. Responds { student, card } where `card.token` is
  // the QR payload, readable HERE AND NOWHERE ELSE (only its hash is stored). Print it now.
  fastify.post("/", {
    preHandler: [authMiddleware, requirePermission("students:manage")],
  }, async (request, reply) => {
    const body = createStudentSchema.parse(request.body);
    return reply.status(201).send(await studentServices.create(body, orgIdOf(request)));
  });

  // POST /api/students/import — a whole class from a CSV the frontend already parsed.
  // Rows with a roll number that is already taken are reported in `skipped`; the rest still import.
  // Every created student comes back with their one-time card token, ready to print as a sheet.
  fastify.post("/import", {
    preHandler: [authMiddleware, requirePermission("students:manage")],
  }, async (request, reply) => {
    const body = importStudentsSchema.parse(request.body);
    return reply.status(201).send(await studentServices.importMany(body, orgIdOf(request)));
  });

  // GET /api/students/:id
  fastify.get("/:id", {
    preHandler: [authMiddleware, requirePermission("students:read")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await studentServices.getById(id, orgIdOf(request)));
  });

  // PATCH /api/students/:id — rename, fix a roll number, move class, or set isActive:false
  // when they leave (which keeps their attendance history).
  fastify.patch("/:id", {
    preHandler: [authMiddleware, requirePermission("students:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateStudentSchema.parse(request.body);
    return reply.send(await studentServices.update(id, orgIdOf(request), body));
  });

  // DELETE /api/students/:id — for a row added by mistake. Takes their card and
  // attendance history with it; to record that a student LEFT, PATCH isActive:false instead.
  fastify.delete("/:id", {
    preHandler: [authMiddleware, requirePermission("students:manage")],
  }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    return reply.send(await studentServices.remove(id, orgIdOf(request)));
  });
};
