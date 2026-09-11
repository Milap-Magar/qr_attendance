import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requirePermission } from './../rbac/rbac.middleware';
import { rbacServices } from "../rbac/rbac.service";
import { userServices } from "./user.service";
import { createUserSchemas, listUsersQuerySchema, updateUserSchema } from "./user.types";
import { authMiddleware, orgIdOf } from "../auth/auth.middleware";
import { organizationServices } from "../organizations/organization.services";
import { idParamSchema } from "../../common/types/common.types";
import { AppError } from "../../common/errors";
import type { Permission } from "../rbac/rbac.types";

// OWNERSHIP check — the part RBAC can't express ("*your own* profile").
// allowed if you are that user, OR your role has `anyUserPermission` (e.g. admin editing anyone)
function assertSelfOrPermission(request: FastifyRequest, targetUserId: string, anyUserPermission: Permission) {
  const { userId, role } = request.user;
  if (targetUserId !== userId && !rbacServices.roleHasPermission(role, anyUserPermission)) {
    throw new AppError(403, "Forbidden", "FORBIDDEN");
  }
}

export const userRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/users/me — who am I, which school, what can I do (frontend uses `permissions` to hide buttons)
  fastify.get("/me", {
    preHandler: authMiddleware
  }, async (request, reply) => {
    const user = await userServices.getUserById(request.user.userId);
    const org = user.organizationId ? await organizationServices.getById(user.organizationId) : null;
    const organization = org && { id: org.id, name: org.name, type: org.type }; // no join code here
    return reply.send({ ...user, organization, permissions: rbacServices.permissionsFor(user.role) });
  });

  // GET /api/users          → everyone in my school
  // GET /api/users?role=users → only my school's students
  fastify.get('/',{
    preHandler: [authMiddleware, requirePermission("users:read")]
  }, async(request, reply) => {
    const { role } = listUsersQuerySchema.parse(request.query);
    const users = await userServices.getAllUsers(orgIdOf(request), role);
    return reply.status(200).send(users);
  });

  // GET /api/users/:id — yourself, or staff with users:read (their own school only)
  fastify.get(`/:id` ,{
    preHandler: authMiddleware
  }, async(request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    assertSelfOrPermission(request, id, "users:read");
    const user = await userServices.getUserInOrg(id, request.user.orgId);
    return reply.status(200).send(user)
  })

  // POST /api/users — add a student / teacher / admin to MY school (school admins by default)
  fastify.post('/',{
    preHandler: [authMiddleware, requirePermission("users:create")]
  },  async(request, reply) => {
    const body = createUserSchemas.parse(request.body);
    const newUser = await userServices.addUsers(body, orgIdOf(request));
    return reply.status(201).send(newUser);
  })

  // PATCH /api/users/:id — edit your own profile, or anyone's with users:update
  fastify.patch('/:id',{
    preHandler: authMiddleware
  },  async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    assertSelfOrPermission(request, id, "users:update");
    const body = updateUserSchema.parse(request.body);
    const updatedUser = await userServices.updateUsers(id, request.user.orgId, body);
    return reply.status(200).send(updatedUser);
  })
}
