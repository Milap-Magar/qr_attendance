import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, getDefaultOrg, loginAs, PASSWORD, resetDb, type TestApp } from "./helpers";

let app: TestApp;
let admin: Awaited<ReturnType<typeof loginAs>>;
// a staff account created the way a school actually creates one: by an admin, through POST /api/users
let staff: { name: string; email: string; password: string };

const login = (email: string, password = PASSWORD) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
  admin = await loginAs(app, "admin");
  staff = { name: "Ram Bahadur", email: "ram@test.com", password: PASSWORD };
  await app.inject({ method: "POST", url: "/api/users", headers: admin.auth, payload: { ...staff, role: "teachers" } });
});
afterAll(() => app.close());

describe("who can have an account", () => {
  // Students are roster rows, not logins. The join-code sign-up that used to create them is gone,
  // so there is no way for an outsider to make themselves an account at all.
  test("there is no public sign-up route", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { name: "Outsider", email: "outsider@test.com", password: PASSWORD, joinCode: (await getDefaultOrg()).joinCode },
    });
    expect(res.statusCode).toBe(404);
  });

  test("an admin adds staff, and they can log in", async () => {
    expect((await login(staff.email)).statusCode).toBe(200);
  });

  test("a school cannot create a student account through the staff route", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/users", headers: admin.auth,
      payload: { name: "Student Account", email: "student@test.com", password: PASSWORD, role: "users" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.role).toBeArray();
  });

  test("same email (different case) → 409", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/users", headers: admin.auth,
      payload: { ...staff, email: "RAM@test.com", role: "teachers" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EMAIL_TAKEN");
  });

  test("weak password → 400 with field errors", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/users", headers: admin.auth,
      payload: { ...staff, email: "weak@test.com", password: "123", role: "teachers" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.password).toBeArray();
  });
});

describe("login", () => {
  test("correct password → tokens", async () => {
    const res = await login(staff.email);
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeString();
    expect(res.json().refreshToken).toBeString();
    expect(res.json().user.password).toBeUndefined();
  });

  test("wrong password and unknown email give the SAME 401", async () => {
    const wrong = await login(staff.email, "Wrong1!aa");
    const unknown = await login("nobody@test.com");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });
});

describe("access token", () => {
  test("no token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/users/me" });
    expect(res.statusCode).toBe(401);
  });

  test("valid token → /me returns the user and their permissions", async () => {
    const { accessToken } = (await login(staff.email)).json();
    const res = await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: staff.email, role: "teachers" });
    // the frontend hides buttons by these, so a teacher must come back able to scan but not to enrol
    expect(res.json().permissions).toContain("attendance:scan");
    expect(res.json().permissions).toContain("students:read");
    expect(res.json().permissions).not.toContain("students:manage");
  });

  test("expired token → 401", async () => {
    const expired = app.jwt.sign({ userId: crypto.randomUUID(), role: "teachers", orgId: null }, { expiresIn: -10 });
    const res = await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${expired}` } });
    expect(res.statusCode).toBe(401);
  });
});

describe("refresh + logout", () => {
  test("refresh rotates: new pair works, old refresh token is dead", async () => {
    const session = (await login(staff.email)).json();

    const first = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: session.refreshToken } });
    expect(first.statusCode).toBe(200);
    const rotated = first.json();
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    const me = await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${rotated.accessToken}` } });
    expect(me.statusCode).toBe(200);

    const reuse = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: session.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("logout revokes the refresh token", async () => {
    const session = (await login(staff.email)).json();

    const out = await app.inject({ method: "POST", url: "/api/auth/logout", payload: { refreshToken: session.refreshToken } });
    expect(out.statusCode).toBe(204);

    const res = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: session.refreshToken } });
    expect(res.statusCode).toBe(401);
  });

  test("garbage refresh token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: "nope" } });
    expect(res.statusCode).toBe(401);
  });
});
