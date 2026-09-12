import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClass, createOrg, createStudent, createStudentInNewClass, createTestApp, getDefaultOrg, loginAs, resetDb, type TestApp } from "./helpers";

let app: TestApp;
let admin: Awaited<ReturnType<typeof loginAs>>;
let teacher: Awaited<ReturnType<typeof loginAs>>;
let orgId: string;
let classId: string;
let sessionId: string;

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const openSession = async (title: string) =>
  (await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: teacher.auth, payload: { title, closesAt: inOneHour() } })).json();

const scan = (token: string, session = sessionId, who = teacher) =>
  app.inject({ method: "POST", url: "/api/qr/scan", headers: who.auth, payload: { sessionId: session, token } });

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
  admin = await loginAs(app, "admin");
  teacher = await loginAs(app, "teachers");
  orgId = (await getDefaultOrg()).id;
  classId = (await createClass(orgId)).id;
});
afterAll(() => app.close());

describe("credentials (QR cards)", () => {
  test("adding a student issues their card straight away", async () => {
    const { student, card } = await createStudent(orgId, classId);
    expect(card.token).toBeString();
    expect(card.studentId).toBe(student.id);
    expect(card.revokedAt).toBeNull();
  });

  test("re-issuing is admin-only", async () => {
    const { student } = await createStudent(orgId, classId);
    const res = await app.inject({ method: "POST", url: "/api/qr/credentials", headers: teacher.auth, payload: { studentId: student.id } });
    expect(res.statusCode).toBe(403);
  });

  test("listing never exposes the token", async () => {
    const { student } = await createStudent(orgId, classId);
    const res = await app.inject({ method: "GET", url: `/api/qr/credentials?studentId=${student.id}`, headers: admin.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].token).toBeUndefined();
    expect(res.json()[0].tokenHash).toBeUndefined();
  });

  test("issuing a card for another school's student → 404", async () => {
    const outsider = await createStudentInNewClass((await createOrg()).id);
    const res = await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { studentId: outsider.student.id } });
    expect(res.statusCode).toBe(404); // same as a student that doesn't exist: their id isn't even confirmed
  });
});

describe("sessions", () => {
  test("teacher opens a session", async () => {
    const res = await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: teacher.auth, payload: { title: "Morning", closesAt: inOneHour() } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: "Morning", status: "open", checkedInCount: 0 });
    sessionId = res.json().id;
  });

  test("closesAt in the past → 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/attendance/sessions", headers: teacher.auth, payload: { title: "Bad", closesAt: "2020-01-01T00:00:00Z" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.closesAt).toBeArray();
  });
});

describe("scan", () => {
  test("valid card in an open session → 201 with the student, roll no and class", async () => {
    const { student, card } = await createStudent(orgId, classId, { name: "Sita Rai" });
    const res = await scan(card.token);
    expect(res.statusCode).toBe(201);
    expect(res.json().student).toMatchObject({ id: student.id, name: "Sita Rai", rollNo: student.rollNo });
    expect(res.json().student.class.label).toBe("10 A");
    expect(res.json().record.attendanceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("unknown QR → 404", async () => {
    const res = await scan("not-a-real-token");
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("QR_NOT_FOUND");
  });

  // reprinting a lost card must kill the lost one, or whoever found it can still use it
  test("re-issuing a card revokes the one the student used to hold", async () => {
    const { student, card } = await createStudent(orgId, classId);
    const replacement = (await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { studentId: student.id } })).json();

    const lost = await scan(card.token);
    expect(lost.statusCode).toBe(403);
    expect(lost.json().code).toBe("QR_REVOKED");

    expect((await scan(replacement.token)).statusCode).toBe(201);
  });

  test("revoked card → 403 QR_REVOKED", async () => {
    const { card } = await createStudent(orgId, classId);
    const revoke = await app.inject({ method: "PATCH", url: `/api/qr/credentials/${card.id}/revoke`, headers: admin.auth });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().revokedAt).not.toBeNull();

    expect((await scan(card.token)).statusCode).toBe(403);
  });

  test("a student who left → 403 STUDENT_INACTIVE", async () => {
    const { student, card } = await createStudent(orgId, classId);
    await app.inject({ method: "PATCH", url: `/api/students/${student.id}`, headers: admin.auth, payload: { isActive: false } });

    const res = await scan(card.token);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("STUDENT_INACTIVE");
  });

  test("session that hasn't started → 409 SESSION_NOT_OPEN", async () => {
    const { card } = await createStudent(orgId, classId);
    const future = (await app.inject({
      method: "POST", url: "/api/attendance/sessions", headers: teacher.auth,
      payload: { title: "Tomorrow", opensAt: new Date(Date.now() + 86_400_000).toISOString(), closesAt: new Date(Date.now() + 90_000_000).toISOString() },
    })).json();
    expect(future.status).toBe("upcoming");

    const res = await scan(card.token, future.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SESSION_NOT_OPEN");
  });

  test("a card from another school is unknown here (no cross-tenant leak)", async () => {
    const other = await createOrg();
    const group = await createClass(other.id);
    const outsider = await createStudent(other.id, group.id);

    const res = await scan(outsider.card.token);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("QR_NOT_FOUND"); // same answer as a token that doesn't exist at all
  });
});

// THE rule: a student is present once a DAY, no matter how many sessions they are scanned into.
describe("one presence per day", () => {
  test("the same card twice in one session → 409 ALREADY_PRESENT", async () => {
    const { card } = await createStudent(orgId, classId, { name: "Bina Gurung" });
    expect((await scan(card.token)).statusCode).toBe(201);

    const again = await scan(card.token);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("ALREADY_PRESENT");
    expect(again.json().message).toContain("Bina Gurung");
  });

  test("already present carries over to a DIFFERENT session the same day", async () => {
    const { card } = await createStudent(orgId, classId);
    expect((await scan(card.token)).statusCode).toBe(201);

    const period2 = await openSession("Period 2");
    const res = await scan(card.token, period2.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ALREADY_PRESENT");
  });

  test("two students in the same session are both recorded", async () => {
    const session = await openSession("Assembly");
    const a = await createStudent(orgId, classId);
    const b = await createStudent(orgId, classId);

    expect((await scan(a.card.token, session.id)).statusCode).toBe(201);
    expect((await scan(b.card.token, session.id)).statusCode).toBe(201);

    const detail = await app.inject({ method: "GET", url: `/api/attendance/sessions/${session.id}`, headers: teacher.auth });
    expect(detail.json().checkedInCount).toBe(2);
  });
});

describe("the daily register", () => {
  let reportClass: string;
  let present: Awaited<ReturnType<typeof createStudent>>;

  beforeAll(async () => {
    reportClass = (await createClass(orgId, { grade: "9", section: "B" })).id;
    present = await createStudent(orgId, reportClass, { rollNo: "1", name: "Present Student" });
    await createStudent(orgId, reportClass, { rollNo: "2", name: "Absent Student" });
    await scan(present.card.token, (await openSession("Register test")).id);
  });

  test("lists every student, present and absent, in roll-number order", async () => {
    const res = await app.inject({ method: "GET", url: `/api/attendance/register?classId=${reportClass}`, headers: admin.auth });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toMatchObject({ present: 1, absent: 1, total: 2 });
    expect(body.class.label).toBe("9 B");
    expect(body.students.map((s: { rollNo: string }) => s.rollNo)).toEqual(["1", "2"]);
    expect(body.students[0]).toMatchObject({ name: "Present Student", present: true });
    expect(body.students[0].scannedAt).not.toBeNull();
    expect(body.students[1]).toMatchObject({ name: "Absent Student", present: false, scannedAt: null });
  });

  test("a day nobody was scanned shows everyone absent", async () => {
    const res = await app.inject({ method: "GET", url: `/api/attendance/register?classId=${reportClass}&date=2020-01-02`, headers: admin.auth });
    expect(res.json()).toMatchObject({ date: "2020-01-02", present: 0, absent: 2 });
  });

  test("a teacher can read the register too", async () => {
    const res = await app.inject({ method: "GET", url: `/api/attendance/register?classId=${reportClass}`, headers: teacher.auth });
    expect(res.statusCode).toBe(200);
  });

  test("the school summary tallies every class for the day", async () => {
    const res = await app.inject({ method: "GET", url: "/api/attendance/summary", headers: admin.auth });
    expect(res.statusCode).toBe(200);

    const row = res.json().classes.find((c: { id: string }) => c.id === reportClass);
    expect(row).toMatchObject({ label: "9 B", total: 2, present: 1, absent: 1 });
  });

  test("one student's history", async () => {
    const res = await app.inject({ method: "GET", url: `/api/attendance/students/${present.student.id}`, headers: admin.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].attendanceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("session records + close", () => {
  test("records name the student, their roll number and their class", async () => {
    const session = await openSession("Records");
    const { student } = await createStudent(orgId, classId, { name: "Record Student" });
    const card = (await app.inject({ method: "POST", url: "/api/qr/credentials", headers: admin.auth, payload: { studentId: student.id } })).json();
    await scan(card.token, session.id);

    const res = await app.inject({ method: "GET", url: `/api/attendance/sessions/${session.id}/records`, headers: admin.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ student: { id: student.id, name: "Record Student" } });
    expect(res.json()[0].class.label).toBe("10 A");
  });

  test("closing stops scans (works with an empty JSON body too)", async () => {
    const session = await openSession("Closing");
    const close = await app.inject({
      method: "PATCH", url: `/api/attendance/sessions/${session.id}/close`,
      headers: { ...teacher.auth, "content-type": "application/json" },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe("closed");

    const { card } = await createStudent(orgId, classId);
    const res = await scan(card.token, session.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SESSION_CLOSED");
  });
});
