import type { FastifyPluginAsync } from "fastify";
import { authMiddleware, orgIdOf } from "../auth/auth.middleware";
import { requirePermission } from "../rbac/rbac.middleware";
import { rbacServices } from "../rbac/rbac.service";
import { organizationServices } from "./organization.services";
import { lookupQuerySchema, updateOrganizationSchema } from "./organization.types";

// A school / college is an "organization" (a tenant).
//   sign up a school:  POST /api/auth/register-school   (auth module, because it logs you in)
//   student joins one: POST /api/auth/register { ..., joinCode }
export const organizationRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/organizations/lookup?code=K7QM-X2PD — PUBLIC. The sign-up page shows
  // "You're joining Sunrise Academy" before the student creates an account.
  fastify.get("/lookup", async (request, reply) => {
    const { code } = lookupQuerySchema.parse(request.query);
    return reply.send(await organizationServices.findByJoinCode(code));
  });

  // GET /api/organizations/current — my school. The join code is only included for its admins.
  fastify.get("/current", {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { joinCode, ...organization } = await organizationServices.getById(orgIdOf(request));
    const canManage = rbacServices.roleHasPermission(request.user.role, "organization:manage");
    return reply.send(canManage ? { ...organization, joinCode } : organization);
  });

  // PATCH /api/organizations/current — rename the school / change its type
  fastify.patch("/current", {
    preHandler: [authMiddleware, requirePermission("organization:manage")],
  }, async (request, reply) => {
    const body = updateOrganizationSchema.parse(request.body);
    return reply.send(await organizationServices.update(orgIdOf(request), body));
  });

  // POST /api/organizations/current/join-code — new join code (the old one stops working)
  fastify.post("/current/join-code", {
    preHandler: [authMiddleware, requirePermission("organization:manage")],
  }, async (request, reply) => {
    return reply.send(await organizationServices.regenerateJoinCode(orgIdOf(request)));
  });

  // GET /api/organizations — every school on the platform (the SaaS operator only)
  fastify.get("/", {
    preHandler: [authMiddleware, requirePermission("platform:manage")],
  }, async (_request, reply) => {
    return reply.send(await organizationServices.listAll());
  });
};
