// these are bascially for routing.
// also known as - a signal that shows the road

import { type FastifyPluginAsync } from "fastify";
import { authServices } from './auth.services';
import type { loginUserTypes, registerUserTypes } from './auth.types';

export const authRoutes : FastifyPluginAsync = async (fastify) => {
    
    // login routes
    fastify.post("/login",  async (request, reply) => {
        const { email, password } = request.body as loginUserTypes; 
        const data = await authServices.login({email, password});
        if(data === "wollahhh you are INNNN!!"){
            return reply.status(200)
            .send({
                message: data
            });
        }else if(data === "Email not found"){
            return reply.status(404).send({
                message: data
            });
        }else{
            return reply.status(401).send({
                message: data
            })
        }

    }),

    // register routes
    fastify.post("/register", async(request, reply) => {
        const {name, email, password, gender} = request.body as registerUserTypes;
        const data = await authServices.register({name, email, password, gender}); 
        if(data === "User Exists!!"){
            // 409 for conflict
            return reply.status(409).send({
                message: data
            })
        }else{
            return reply.status(201).send({
                message: "User Created Successfully"
            })
        }
    })
}