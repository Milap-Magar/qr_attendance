import { sql } from "drizzle-orm";
import { buildApp } from "../src/app";
import { db } from "../src/db";
import { userServices } from "../src/modules/users/user.service";
import type { Role } from "../src/common/types/common.types";

export const PASSWORD = "Passw0rd!";

// a real app instance, no port. Use app.inject({ method, url, payload, headers })
export async function createTestApp() {
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

// wipe every table between test files
export async function resetDb() {
  await db.execute(sql`TRUNCATE users, refresh_tokens, credentials, attendance_sessions, attendance_records CASCADE`);
}

// create a user with any role and log them in → { user, accessToken, refreshToken, auth }
// `auth` is ready to spread into inject(): app.inject({ ..., headers: admin.auth })
export async function loginAs(app: TestApp, role: Role, email = `${role}-${crypto.randomUUID()}@test.com`) {
  await userServices.addUsers({ name: `Test ${role}`, email, password: PASSWORD, gender: "other", role });
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASSWORD } });
  const body = res.json();
  return { ...body, auth: { authorization: `Bearer ${body.accessToken}` } } as {
    user: { id: string; name: string; email: string; role: Role };
    accessToken: string;
    refreshToken: string;
    auth: { authorization: string };
  };
}
