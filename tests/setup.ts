// Preloaded by bunfig.toml before every `bun test` run.
// `bun test` sets NODE_ENV=test, so Bun loads .env.test on top of .env.
import { afterAll } from "bun:test";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// SAFETY: the tests delete every row. Never let that happen to the real database.
if (!new URL(process.env.DATABASE_URL ?? "").pathname.includes("test")) {
  throw new Error("Refusing to run tests: DATABASE_URL must point at a *test* database (see .env.example)");
}

const { client, db } = await import("../src/db");
await migrate(db, { migrationsFolder: "./drizzle" });

afterAll(async () => {
  await client.end();
});
