import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get("/", async () => {
  return { status: "ok", message: "Powered by Bun Fastify!!" };
});

await app.listen({ port : 3000 });
