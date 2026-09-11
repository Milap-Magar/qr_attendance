import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, loginAs, PASSWORD, resetDb, type TestApp } from "./helpers";

let app: TestApp;
let student: Awaited<ReturnType<typeof loginAs>>;
let otherStudent: Awaited<ReturnType<typeof loginAs>>;
let admin: Awaited<ReturnType<typeof loginAs>>;
let system: Awaited<ReturnType<typeof loginAs>>;

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
  student = await loginAs(app, "users");
  otherStudent = await loginAs(app, "users");
  admin = await loginAs(app, "admin");
  system = await loginAs(app, "system");
});
afterAll(() => app.close());

describe("RBAC: 401 → 403 → 200", () => {
  test("GET /api/users", async () => {
    expect((await app.inject({ method: "GET", url: "/api/users" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/users", headers: student.auth })).statusCode).toBe(403);
    const ok = await app.inject({ method: "GET", url: "/api/users?role=users", headers: admin.auth });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().every((u: { role: string }) => u.role === "users")).toBe(true);
  });

  test("only system can create users (with a role)", async () => {
    const payload = { name: "New Teacher", email: "teacher@test.com", password: PASSWORD, role: "teachers" };
    expect((await app.inject({ method: "POST", url: "/api/users", headers: admin.auth, payload })).statusCode).toBe(403);
    const res = await app.inject({ method: "POST", url: "/api/users", headers: system.auth, payload });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ role: "teachers" });
    expect(res.json().password).toBeUndefined();

    // and the created user can log in (password was hashed, not stored raw)
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "teacher@test.com", password: PASSWORD } });
    expect(login.statusCode).toBe(200);
  });
});

describe("ownership", () => {
  test("a student can read themselves but not someone else", async () => {
    expect((await app.inject({ method: "GET", url: `/api/users/${student.user.id}`, headers: student.auth })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/users/${otherStudent.user.id}`, headers: student.auth })).statusCode).toBe(403);
  });

  test("a student can edit themselves but not someone else", async () => {
    const self = await app.inject({ method: "PATCH", url: `/api/users/${student.user.id}`, headers: student.auth, payload: { name: "Renamed Me" } });
    expect(self.statusCode).toBe(200);
    expect(self.json().name).toBe("Renamed Me");

    const other = await app.inject({ method: "PATCH", url: `/api/users/${otherStudent.user.id}`, headers: student.auth, payload: { name: "Hacked" } });
    expect(other.statusCode).toBe(403);
  });

  test("admin can edit anyone", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/users/${otherStudent.user.id}`, headers: admin.auth, payload: { gender: "female" } });
    expect(res.statusCode).toBe(200);
  });

  test("empty update body → 400, not 500", async () => {
    const res = await app.inject({ method: "PATCH", url: `/api/users/${student.user.id}`, headers: student.auth, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  test("bad id → 400, missing user → 404", async () => {
    expect((await app.inject({ method: "GET", url: "/api/users/abc", headers: admin.auth })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/users/${crypto.randomUUID()}`, headers: admin.auth })).statusCode).toBe(404);
  });
});
