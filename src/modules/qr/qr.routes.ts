import { type FastifyPluginAsync } from "fastify";
import { qrServices } from "./qr.services";
import { authMiddleware } from "../auth/auth.middleware";

export const qrRoutes : FastifyPluginAsync = async(fastify) => {

    // fetch all qr routes:
    fastify.get("/",{
    preHandler: authMiddleware
  },  async(request, reply)=>{
        const data = await qrServices.getQr();
        if(data){
            return reply.status(200).send({
                message: 'QR verified! Your are marked present',
                token: data.data.token,
                expiresAt: data.data.expiresAt,
                sessionId: data.data.qrSessionId,
            })
        }
    })

    fastify.post('/verify',{
        preHandler: authMiddleware
      },  async(request, reply) => {
        const {token} = request.body as {
            token: string,
        };

        const result = await qrServices.verifyQr(token);
        return reply.status(result.status).send(result)
    })
}