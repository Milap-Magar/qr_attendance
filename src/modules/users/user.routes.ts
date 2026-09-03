import type { FastifyPluginAsync } from "fastify";
import { userServices } from "./user.service";
import type { CreateUserType, UpdateUserType } from "./user.types";

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users
  fastify.get('/',async(request, reply) => {
    const users = await userServices.getAllUsers();
    return reply.status(200).send(users);
  });

  //POST /api/users
  fastify.post('/', async(request, reply) => {
    const {name, email, password, gender} = request.body as CreateUserType;
    const newUser = await userServices.addUsers({name, email, password, gender});
    return reply.status(201).send(newUser); 
  })

  // PATCH /api/users
  fastify.patch('/', async (request, reply) => {
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