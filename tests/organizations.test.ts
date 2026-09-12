import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClass, createOrg, createStudent, createTestApp, loginAs, PASSWORD, resetDb, type TestApp } from "./helpers";

let app: TestApp;
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
});
afterAll(() => app.close());

describe("school sign-up + join codes", () => {
  let school: { id: string; name: string; joinCode: string };
  let adminAuth: { authorization: string };

  test("a school signs up → 201, the caller is its admin and is logged in", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/auth/register-school",
      payload: { schoolName: "Sunrise Academy", schoolType: "college", name: "Gita Sharma", email: "gita@sunrise.edu", password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.organization).toMatchObject({ name: "Sunrise Academy", type: "college" });
    expect(body.organization.joinCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(body.user).toMatchObject({ role: "admin", organizationId: body.organization.id });
    school = body.organization;
    adminAuth = { authorization: `Bearer ${body.accessToken}` };

    const me = (await app.inject({ method: "GET", url: "/api/users/me", headers: adminAuth })).json();
    expect(me.organization).toEqual({ id: school.id, name: "Sunrise Academy", type: "college" });
    expect(me.permissions).toContain("organization:manage");
  });

  test("school sign-up validates like a form: field errors per input", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/register-school", payload: { schoolName: "X", name: "Gita", email: "bad", password: "weak" } });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().errors)).toEqual(expect.arrayContaining(["schoolName", "email", "password"]));
  });

  test("a taken email → 409 and NO half-created school", async () => {
    const before = (await app.inject({ method: "GET", url: "/api/organizations", headers: (await loginAs(app, "system")).auth })).json().length;
    const res = await app.inject({
      method: "POST", url: "/api/auth/register-school",
      payload: { schoolName: "Copycat School", name: "Someone", email: "gita@sunrise.edu", password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
    const after = (await app.inject({ method: "GET", url: "/api/organizations", headers: (await loginAs(app, "system")).auth })).json().length;
    expect(after).toBe(before);
  });

  test("public lookup shows the school name for a join code (any formatting), nothing private", async () => {
    const pretty = `${school.joinCode.slice(0, 4).toLowerCase()}-${school.joinCode.slice(4)}`;
    const res = await app.inject({ method: "GET", url: `/api/organizations/lookup?code=${pretty}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: school.id, name: "Sunrise Academy", type: "college" });
    expect(Object.keys(res.json()).sort()).toEqual(["id", "name", "type"]); // no joinCode, no dates

    const bad = await app.inject({ method: "GET", url: "/api/organizations/lookup?code=NOPE2345" });
    expect(bad.statusCode).toBe(404);
    expect(bad.json().code).toBe("INVALID_JOIN_CODE");
  });

  test("admin sees the join code; a teacher of the same school does not", async () => {
    const asAdmin = (await app.inject({ method: "GET", url: "/api/organizations/current", headers: adminAuth })).json();
    expect(asAdmin.joinCode).toBe(school.joinCode);

    const teacher = await loginAs(app, "teachers", { orgId: school.id });
    const asTeacher = await app.inject({ method: "GET", url: "/api/organizations/current", headers: teacher.auth });
    expect(asTeacher.statusCode).toBe(200);
    expect(asTeacher.json().name).toBe("Sunrise Academy");
    expect(asTeacher.json().joinCode).toBeUndefined();
  });

  // the timezone decides which calendar day a scan counts for, so a bad one would break scanning
  test("admin sets the school timezone; nonsense is rejected", async () => {
    const res = await app.inject({ method: "PATCH", url: "/api/organizations/current", headers: adminAuth, payload: { timezone: "Asia/Kathmandu" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().timezone).toBe("Asia/Kathmandu");

    const bad = await app.inject({ method: "PATCH", url: "/api/organizations/current", headers: adminAuth, payload: { timezone: "Mars/Olympus" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().errors.timezone).toBeArray();
  });

  test("admin renames the school; teachers cannot", async () => {
    const res = await app.inject({ method: "PATCH", url: "/api/organizations/current", headers: adminAuth, payload: { name: "Sunrise College" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Sunrise College");

    const teacher = await loginAs(app, "teachers", { orgId: school.id });
    expect((await app.inject({ method: "PATCH", url: "/api/organizations/current", headers: teacher.auth, payload: { name: "Hacked" } })).statusCode).toBe(403);
  });

  test("regenerating the join code kills the old one", async () => {
    const res = await app.inject({ method: "POST", url: "/api/organizations/current/join-code", headers: adminAuth });
    expect(res.statusCode).toBe(200);
    expect(res.json().joinCode).not.toBe(school.joinCode);

    expect((await app.inject({ method: "GET", url: `/api/organizations/lookup?code=${school.joinCode}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/organizations/lookup?code=${res.json().joinCode}` })).statusCode).toBe(200);
  });
});

// Two schools, A and B. Nothing of A may be visible to, or usable by, B.
describe("tenant isolation", () => {
  let adminA: Awaited<ReturnType<typeof loginAs>>;
  let adminB: Awaited<ReturnType<typeof loginAs>>;
  let studentA: Awaited<ReturnType<typeof createStudent>>;
  let cardA: { id: string; token: string };
  let sessionA: string;
  let sessionB: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([createOrg("School A"), createOrg("School B")]);
    adminA = await loginAs(app, "admin", { orgId: a.id });
    adminB = await loginAs(app, "admin", { orgId: b.id });
    studentA = await createStudent(a.id, (await createClass(a.id)).id);
    cardA = studentA.card;
    sessionA = (await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: adminA.auth, payload: { title: "A class", closesAt: inOneHour() } })).json().id;
    sessionB = (await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: adminB.auth, payload: { title: "B class", closesAt: inOneHour() } })).json().id;
  });

  test("user lists only contain your own school", async () => {
    const ids = (await app.inject({ method: "GET", url: "/api/users", headers: adminB.auth })).json().map((u: { id: string }) => u.id);
    expect(ids).toContain(adminB.user.id);
    expect(ids).not.toContain(adminA.user.id);
  });

  test("another school's user is a 404 — read and edit", async () => {
    expect((await app.inject({ method: "GET", url: `/api/users/${adminA.user.id}`, headers: adminB.auth })).statusCode).toBe(404);
    const edit = await app.inject({ method: "PATCH", url: `/api/users/${adminA.user.id}`, headers: adminB.auth, payload: { name: "Hacked" } });
    expect(edit.statusCode).toBe(404);
  });

  test("classes and students: B sees none of A's, and can't reach them by id", async () => {
    expect((await app.inject({ method: "GET", url: "/api/classes", headers: adminB.auth })).json()).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: "/api/students", headers: adminB.auth })).json()).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: `/api/students/${studentA.student.id}`, headers: adminB.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/classes/${studentA.student.classId}/students`, headers: adminB.auth })).statusCode).toBe(404);
  });

  test("the register of A's class is a 404 at B", async () => {
    const res = await app.inject({ method: "GET", url: `/api/attendance/register?classId=${studentA.student.classId}`, headers: adminB.auth });
    expect(res.statusCode).toBe(404);
  });

  test("sessions: B can't list, read, close or see records of A's", async () => {
    const list = (await app.inject({ method: "GET", url: "/api/attendance/sessions", headers: adminB.auth })).json();
    expect(list.map((s: { id: string }) => s.id)).toEqual([sessionB]);
    expect((await app.inject({ method: "GET", url: `/api/attendance/sessions/${sessionA}`, headers: adminB.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/api/attendance/sessions/${sessionA}/close`, headers: adminB.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/attendance/sessions/${sessionA}/records`, headers: adminB.auth })).statusCode).toBe(404);
  });

  test("cards: B can't issue for, list, or revoke A's students", async () => {
    expect((await app.inject({ method: "POST", url: "/api/qr/credentials", headers: adminB.auth, payload: { studentId: studentA.student.id } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/qr/credentials", headers: adminB.auth })).json()).toHaveLength(0);
    expect((await app.inject({ method: "PATCH", url: `/api/qr/credentials/${cardA.id}/revoke`, headers: adminB.auth })).statusCode).toBe(404);
  });

  test("scan: A's card is unknown at B, and B can't scan into A's session", async () => {
    const foreignCard = await app.inject({ method: "POST", url: "/api/qr/scan", headers: adminB.auth, payload: { sessionId: sessionB, token: cardA.token } });
    expect(foreignCard.statusCode).toBe(404);
    expect(foreignCard.json().code).toBe("QR_NOT_FOUND");

    const foreignSession = await app.inject({ method: "POST", url: "/api/qr/scan", headers: adminB.auth, payload: { sessionId: sessionA, token: cardA.token } });
    expect(foreignSession.statusCode).toBe(404);
    expect(foreignSession.json().code).toBe("SESSION_NOT_FOUND");

    // and at home it works
    const home = await app.inject({ method: "POST", url: "/api/qr/scan", headers: adminA.auth, payload: { sessionId: sessionA, token: cardA.token } });
    expect(home.statusCode).toBe(201);
  });

  test("an admin can't create a `system` account", async () => {
    const res = await app.inject({
      method: "POST", url: "/api/users", headers: adminA.auth,
      payload: { name: "Sneaky Root", email: "root@test.com", password: PASSWORD, role: "system" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("platform (system)", () => {
  test("system lists every school with head counts; school admins cannot", async () => {
    const system = await loginAs(app, "system");
    const res = await app.inject({ method: "GET", url: "/api/organizations", headers: system.auth });
    expect(res.statusCode).toBe(200);
    const schoolA = res.json().find((o: { name: string }) => o.name === "School A");
    expect(schoolA).toMatchObject({ students: 1, staff: 1, sessions: 1 });

    const admin = await loginAs(app, "admin", { orgId: schoolA.id });
    expect((await app.inject({ method: "GET", url: "/api/organizations", headers: admin.auth })).statusCode).toBe(403);
  });

  test("system has no school: school endpoints are 403, /me has organization null", async () => {
    const system = await loginAs(app, "system");
    const me = (await app.inject({ method: "GET", url: "/api/users/me", headers: system.auth })).json();
    expect(me.organization).toBeNull();
    expect((await app.inject({ method: "GET", url: "/api/users", headers: system.auth })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/organizations/current", headers: system.auth })).statusCode).toBe(403);
  });

  test("an access token from before schools existed (no orgId) → 401 so the client refreshes", async () => {
    const legacy = app.jwt.sign({ userId: crypto.randomUUID(), role: "teachers" } as never);
    expect((await app.inject({ method: "GET", url: "/api/users/me", headers: { authorization: `Bearer ${legacy}` } })).statusCode).toBe(401);
  });
});
