import { sql } from "drizzle-orm";
import { buildApp } from "../src/app";
import { db } from "../src/db";
import { userServices } from "../src/modules/users/user.service";
import { organizationServices } from "../src/modules/organizations/organization.services";
import type { Role } from "../src/common/types/common.types";

export const PASSWORD = "Passw0rd!";

// a real app instance, no port. Use app.inject({ method, url, payload, headers })
export async function createTestApp() {
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

// the school loginAs() puts people in when no `orgId` is given. One per test file (resetDb clears it).
let defaultOrg: Promise<{ id: string; joinCode: string }> | null = null;

// wipe every table between test files
export async function resetDb() {
  await db.execute(sql`TRUNCATE organizations, users, refresh_tokens, credentials, attendance_sessions, attendance_records CASCADE`);
  defaultOrg = null;
}

export function createOrg(name = `School ${crypto.randomUUID().slice(0, 6)}`) {
  return organizationServices.create({ name, type: "school" });
}

export function getDefaultOrg() {
  defaultOrg ??= createOrg("Test School");
  return defaultOrg;
}

// create a user with any role and log them in → { user, accessToken, refreshToken, auth }
// `auth` is ready to spread into inject(): app.inject({ ..., headers: admin.auth })
// Everyone lands in the same default school unless `orgId` is given. `system` never has a school.
export async function loginAs(app: TestApp, role: Role, { orgId, email }: { orgId?: string; email?: string } = {}) {
  email ??= `${role}-${crypto.randomUUID()}@test.com`;
  const organizationId = role === "system" ? null : (orgId ?? (await getDefaultOrg()).id);
  await userServices.addUsers({ name: `Test ${role}`, email, password: PASSWORD, gender: "other", role }, organizationId);
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASSWORD } });
  const body = res.json();
  return { ...body, auth: { authorization: `Bearer ${body.accessToken}` } } as {
    user: { id: string; name: string; email: string; role: Role; organizationId: string | null };
    accessToken: string;
    refreshToken: string;
    auth: { authorization: string };
  };
}
