// `bun run db:migrate` — applies every SQL file in ./drizzle that the DB hasn't run yet.
// (the server also does this on startup, see index.ts)
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./index";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations completed");
await client.end();
