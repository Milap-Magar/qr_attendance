import type { FastifyPluginAsync } from "fastify";
import { userServices } from "./user.service";
import type { CreateUserType, UpdateUserType } from "./user.types";
import { authMiddleware } from "../auth/auth.middleware";

export const userRoutes: FastifyPluginAsync = async (fastify) => {

  // /user/me
  fastify.get("/me", async (request, reply) => {
  await request.jwtVerify();

  const { userId} = request.user as { userId : string};

  const user = await userServices.getUserById(userId);

  return reply.send(user);
});

  // GET /api/users
  fastify.get('/',{
    preHandler: authMiddleware
  }, async(request, reply) => {
    // provides all the datasets
    const users = await userServices.getAllUsers();
    // verify the access token
    return reply.status(200).send(users);
  });

  // GET /api/user/:id 
  fastify.get(`/:id` ,{
    preHandler: authMiddleware
  }, async(request, reply) => {
    const {id} = request.params as { id: string };
    const user = await userServices.getUserById(id);
    return reply.status(200).send(user)
  })

  //POST /api/users
  fastify.post('/',{
    preHandler: authMiddleware
  },  async(request, reply) => {
    const {name, email, password, gender, role} = request.body as CreateUserType;
    const newUser = await userServices.addUsers({name, email, password, gender, role});
    return reply.status(201).send(newUser); 
  })

  // PATCH /api/users
  fastify.patch('/',{
    preHandler: authMiddleware
  },  async (request, reply) => {
    const {id, name} = request.body as UpdateUserType;
    const user = await userServices.getUserById(id);
    if(!user){
      return reply.status(404).send({
        message: "User not found!"
      });
    }
    const updatedUser = await userServices.updateUsers({id, name})
    // return the success message
    return reply.status(200).send(updatedUser);
  })
}