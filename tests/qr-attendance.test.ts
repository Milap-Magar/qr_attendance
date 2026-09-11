import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestApp, loginAs, resetDb, type TestApp } from "./helpers";

let app: TestApp;
let admin: Awaited<ReturnType<typeof loginAs>>;
let teacher: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;
let cardToken: string;
let sessionId: string;

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
  admin = await loginAs(app, "admin");
  teacher = await loginAs(app, "teachers");
  student = await loginAs(app, "users");
});
afterAll(() => app.close());

describe("credentials (QR cards)", () => {
  test("admin issues a card → plain token returned once", async () => {
    const res = await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { userId: student.user.id } });
    expect(res.statusCode).toBe(201);
    cardToken = res.json().token;
    expect(cardToken).toBeString();
  });

  test("teachers and students cannot issue cards", async () => {
    for (const who of [teacher, student]) {
      const res = await app.inject({ method: "POST", url: "/api/qr/credentials", headers: who.auth, payload: { userId: student.user.id } });
      expect(res.statusCode).toBe(403);
    }
  });

  test("listing never exposes the token", async () => {
    const res = await app.inject({ method: "GET", url: `/api/qr/credentials?userId=${student.user.id}`, headers: admin.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].token).toBeUndefined();
    expect(res.json()[0].tokenHash).toBeUndefined();
  });
});

describe("sessions", () => {
  test("teacher opens a session", async () => {
    const res = await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: teacher.auth, payload: { title: "Math 101", closesAt: inOneHour() } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: "Math 101", status: "open", checkedInCount: 0 });
    sessionId = res.json().id;
  });

  test("closesAt in the past → 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: teacher.auth, payload: { title: "Bad", closesAt: "2020-01-01T00:00:00Z" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.closesAt).toBeArray();
  });

  test("students cannot open sessions", async () => {
    const res = await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: student.auth, payload: { title: "X", closesAt: inOneHour() } });
    expect(res.statusCode).toBe(403);
  });
});

describe("scan", () => {
  test("valid card in an open session → 201 with the student", async () => {
    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: cardToken } });
    expect(res.statusCode).toBe(201);
    expect(res.json().student).toMatchObject({ id: student.user.id, name: student.user.name });
  });

  test("same card again → 409 ALREADY_SCANNED", async () => {
    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: cardToken } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ALREADY_SCANNED");
  });

  test("unknown QR → 404", async () => {
    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: "not-a-real-token" } });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("QR_NOT_FOUND");
  });

  test("students cannot scan", async () => {
    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: student.auth, payload: { sessionId, token: cardToken } });
    expect(res.statusCode).toBe(403);
  });

  test("re-issuing a card revokes the old one", async () => {
    const other = await loginAs(app, "users");
    const oldCard = (await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { userId: other.user.id } })).json();
    const newCard = (await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { userId: other.user.id } })).json();

    const oldScan = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: oldCard.token } });
    expect(oldScan.statusCode).toBe(403);
    expect(oldScan.json().code).toBe("QR_REVOKED");

    const newScan = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: newCard.token } });
    expect(newScan.statusCode).toBe(201);
  });

  test("revoked card → 403 QR_REVOKED", async () => {
    const other = await loginAs(app, "users");
    const card = (await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { userId: other.user.id } })).json();
    const revoke = await app.inject({ method: "PATCH", url: `/api/qr/credentials/${card.id}/revoke`, headers: admin.auth });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().revokedAt).not.toBeNull();

    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: card.token } });
    expect(res.statusCode).toBe(403);
  });

  test("session that hasn't started → 409 SESSION_NOT_OPEN", async () => {
    const future = (await app.inject({
      method: "POST", url: "/api/attendance/sessions", headers: teacher.auth,
      payload: { title: "Tomorrow", opensAt: new Date(Date.now() + 86_400_000).toISOString(), closesAt: new Date(Date.now() + 90_000_000).toISOString() },
    })).json();
    expect(future.status).toBe("upcoming");
    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId: future.id, token: cardToken } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SESSION_NOT_OPEN");
  });
});

describe("records + close", () => {
  test("admin sees who checked in; teacher does not (reports:read)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/attendance/sessions/${sessionId}/records`, headers: admin.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((r: { student: { id: string } }) => r.student.id)).toContain(student.user.id);

    const denied = await app.inject({ method: "GET", url: `/api/attendance/sessions/${sessionId}/records`, headers: teacher.auth });
    expect(denied.statusCode).toBe(403);
  });

  test("student sees their own history", async () => {
    const res = await app.inject({ method: "GET", url: "/api/attendance/me", headers: student.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].session.title).toBe("Math 101");
  });

  test("closing stops scans (works with an empty JSON body too)", async () => {
    const close = await app.inject({
      method: "PATCH", url: `/api/attendance/sessions/${sessionId}/close`,
      headers: { ...teacher.auth, "content-type": "application/json" },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json()).toMatchObject({ status: "closed", checkedInCount: 2 });

    const late = await loginAs(app, "users");
    const card = (await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { userId: late.user.id } })).json();
    const res = await app.inject({ method: "POST", url: "/api/qr/scan", headers: teacher.auth, payload: { sessionId, token: card.token } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SESSION_CLOSED");
  });
});
