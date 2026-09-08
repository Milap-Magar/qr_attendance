import { fastify, type FastifyPluginAsync } from "fastify";
import { qrServices } from "./qr.services";

export const qrRoutes : FastifyPluginAsync = async(fastify) => {

    // fetch all qr routes:
    // fastify.get("/", async(request, reply)=>{
    //     const { id } = request.user as { id : string };
    //     const data = await qrServices.(id);
    //     if(data){
    //         return reply.status(200).send({
    //             message: 'QR verified! Your are marked present'
    //         })
    //     }
    // })

    fastify.post('/verify', async(request, reply) => {
        const {token} = request.body as {
            token: string,
        };

        const result = await qrServices.verifyQr(token);
        return reply.status(result.status).send(result)
    })
}