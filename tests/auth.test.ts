import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, getDefaultOrg, PASSWORD, resetDb, type TestApp } from "./helpers";

let app: TestApp;
let student: { name: string; email: string; password: string; joinCode: string };

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
  student = { name: "Ram Bahadur", email: "ram@test.com", password: PASSWORD, joinCode: (await getDefaultOrg()).joinCode };
});
afterAll(() => app.close());

describe("register", () => {
  test("creates a student and returns both tokens", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: student });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({ email: "ram@test.com", role: "users", organizationId: (await getDefaultOrg()).id });
    expect(body.user.password).toBeUndefined();
    expect(body.accessToken).toBeString();
    expect(body.refreshToken).toBeString();
  });

  test("ignores a role sent in the body", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/auth/register",
      payload: { ...student, email: "sneaky@test.com", role: "admin" },
    });
    expect(res.json().user.role).toBe("users");
  });

  test("same email (different case) → 409", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { ...student, email: "RAM@test.com" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EMAIL_TAKEN");
  });

  test("weak password → 400 with field errors", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { ...student, email: "x@test.com", password: "123" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.password).toBeArray();
  });
});

describe("login", () => {
  test("correct password → tokens", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: student.email, password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeString();
  });

  test("wrong password and unknown email give the SAME 401", async () => {
    const wrong = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: student.email, password: "Wrong1!aa" } });
    const unknown = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "nobody@test.com", password: PASSWORD } });
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
    const { accessToken } = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: student.email, password: PASSWORD } })).json();
    const res = await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: student.email, role: "users", permissions: ["profile:read", "profile:update", "qr:self"] });
  });

  test("expired token → 401", async () => {
    const expired = app.jwt.sign({ userId: crypto.randomUUID(), role: "users", orgId: null }, { expiresIn: -10 });
    const res = await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${expired}` } });
    expect(res.statusCode).toBe(401);
  });
});

describe("refresh + logout", () => {
  test("refresh rotates: new pair works, old refresh token is dead", async () => {
    const login = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: student.email, password: PASSWORD } })).json();

    const first = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: login.refreshToken } });
    expect(first.statusCode).toBe(200);
    const rotated = first.json();
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    const me = await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${rotated.accessToken}` } });
    expect(me.statusCode).toBe(200);

    const reuse = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: login.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("logout revokes the refresh token", async () => {
    const login = (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: student.email, password: PASSWORD } })).json();

    const out = await app.inject({ method: "POST", url: "/api/auth/logout", payload: { refreshToken: login.refreshToken } });
    expect(out.statusCode).toBe(204);

    const res = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: login.refreshToken } });
    expect(res.statusCode).toBe(401);
  });

  test("garbage refresh token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: "nope" } });
    expect(res.statusCode).toBe(401);
  });
});
