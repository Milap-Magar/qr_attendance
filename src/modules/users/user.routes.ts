import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requirePermission } from './../rbac/rbac.middleware';
import { rbacServices } from "../rbac/rbac.service";
import { userServices } from "./user.service";
import { createUserSchemas, listUsersQuerySchema, updateUserSchema } from "./user.types";
import { authMiddleware } from "../auth/auth.middleware";
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

  // GET /api/users/me — who am I + what can I do (frontend uses `permissions` to hide buttons)
  fastify.get("/me", {
    preHandler: authMiddleware
  }, async (request, reply) => {
    const user = await userServices.getUserById(request.user.userId);
    return reply.send({ ...user, permissions: rbacServices.permissionsFor(user.role) });
  });

  // GET /api/users          → everyone
  // GET /api/users?role=users → only students
  fastify.get('/',{
    preHandler: [authMiddleware, requirePermission("users:read")]
  }, async(request, reply) => {
    const { role } = listUsersQuerySchema.parse(request.query);
    const users = await userServices.getAllUsers(role);
    return reply.status(200).send(users);
  });

  // GET /api/users/:id — yourself, or staff with users:read
  fastify.get(`/:id` ,{
    preHandler: authMiddleware
  }, async(request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    assertSelfOrPermission(request, id, "users:read");
    const user = await userServices.getUserById(id);
    return reply.status(200).send(user)
  })

  // POST /api/users — create any kind of account (teacher, admin...). system only by default.
  fastify.post('/',{
    preHandler: [authMiddleware, requirePermission("users:create")]
  },  async(request, reply) => {
    const body = createUserSchemas.parse(request.body);
    const newUser = await userServices.addUsers(body);
    return reply.status(201).send(newUser);
  })

  // PATCH /api/users/:id — edit your own profile, or anyone's with users:update
  fastify.patch('/:id',{
    preHandler: authMiddleware
  },  async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    assertSelfOrPermission(request, id, "users:update");
    const body = updateUserSchema.parse(request.body);
    const updatedUser = await userServices.updateUsers(id, body);
    return reply.status(200).send(updatedUser);
  })
}
