import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

// ONE connection pool for the whole app. Everything imports `db` from here.
export const client = postgres(config.databaseUrl);

// exporting the schema's database
export const db = drizzle(client, { schema });
