// Entry point: `bun run dev` (auto-restart) or `bun run start`
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { buildApp } from "./src/app";
import { client, db } from "./src/db";
import { config } from "./src/config";

const fastify = await buildApp();

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
      port: config.port,
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

// Ctrl+C / docker stop → finish in-flight requests, close the DB pool, exit
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await fastify.close();
    await client.end();
    process.exit(0);
  });
}

start();
