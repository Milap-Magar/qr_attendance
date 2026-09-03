import "dotenv/config";
import Fastify from "fastify";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { userRoutes } from "./src/modules/users/user.routes";

const client = postgres(process.env.DATABASE_URL!, {
  max: 1,
});

const db = drizzle(client);

const fastify = Fastify({
  logger: true,
});

// Health check
fastify.get("/health", async () => {
  return {
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };
});

// Root route
fastify.get("/", async () => {
  return "Hello World";
});

// API routes
fastify.register(userRoutes, {
  prefix: "/api/users",
});

async function start() {
  try {
    // 1. Check database connection
    await client`SELECT NOW()`;

    fastify.log.info("🟩Database connected successfully🟩");

    // 2. Run migrations
    await migrate(db, {
      migrationsFolder: "./drizzle",
    });

    fastify.log.info(`🚀Database migrations completed🚀`);

    // 3. Start server
    await fastify.listen({
      port: 3000,
      host: "0.0.0.0",
      listenTextResolver: (address) => {
        return `🚀Custom message: Server is listening @ ${address}🚀`;
      },
    });
  } catch (error) {
    fastify.log.error(error);

    await client.end();

    process.exit(1);
  }
}

start();