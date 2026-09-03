import 'dotenv/config';
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "./schema";

//connecting the database
const client = postgres(process.env.DATABASE_URL);
// exporting the schema's database
export const db = drizzle(client, {schema});
