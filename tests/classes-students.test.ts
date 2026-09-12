import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClass, createOrg, createStudent, createTestApp, getDefaultOrg, loginAs, resetDb, type TestApp } from "./helpers";

let app: TestApp;
let admin: Awaited<ReturnType<typeof loginAs>>;
let teacher: Awaited<ReturnType<typeof loginAs>>;
let orgId: string;

const post = (url: string, payload: unknown, who = admin) => app.inject({ method: "POST", url, headers: who.auth, payload: payload as object });
const get = (url: string, who = admin) => app.inject({ method: "GET", url, headers: who.auth });

beforeAll(async () => {
  await resetDb();
  app = await createTestApp();
  admin = await loginAs(app, "admin");
  teacher = await loginAs(app, "teachers");
  orgId = (await getDefaultOrg()).id;
});
afterAll(() => app.close());

describe("classes", () => {
  test("admin creates a class; the label reads the way a school says it", async () => {
    const res = await post("/api/classes", { grade: "10", section: "A", academicYear: "2026" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ grade: "10", section: "A", academicYear: "2026", label: "10 A", studentCount: 0 });
  });

  test("a grade with no sections labels as just the grade", async () => {
    const res = await post("/api/classes", { grade: "Nursery", academicYear: "2026" });
    expect(res.json()).toMatchObject({ section: "", label: "Nursery" });
  });

  test("the same grade/section/year twice → 409", async () => {
    await post("/api/classes", { grade: "8", section: "A", academicYear: "2026" });
    const again = await post("/api/classes", { grade: "8", section: "A", academicYear: "2026" });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("CLASS_EXISTS");
  });

  // the whole point of academicYear: next year's Grade 8 A is a different roster
  test("the same class in another year is a different class", async () => {
    const res = await post("/api/classes", { grade: "8", section: "A", academicYear: "2027" });
    expect(res.statusCode).toBe(201);
  });

  test("teachers can read classes but not create them", async () => {
    expect((await get("/api/classes", teacher)).statusCode).toBe(200);
    expect((await post("/api/classes", { grade: "7", academicYear: "2026" }, teacher)).statusCode).toBe(403);
  });

  test("listing filters by academic year and counts students", async () => {
    const group = await createClass(orgId, { grade: "6", section: "C", academicYear: "2026" });
    await createStudent(orgId, group.id);
    await createStudent(orgId, group.id);

    const res = await get("/api/classes?academicYear=2026");
    expect(res.json().every((c: { academicYear: string }) => c.academicYear === "2026")).toBe(true);
    expect(res.json().find((c: { id: string }) => c.id === group.id).studentCount).toBe(2);
  });

  test("academic-years lists what the school actually has, newest first", async () => {
    const years = (await get("/api/classes/academic-years")).json() as string[];
    expect(years[0]).toBe("2027");
    expect(years).toContain("2026");
  });

  test("a class with students can't be deleted", async () => {
    const group = await createClass(orgId, { grade: "5", section: "Z" });
    await createStudent(orgId, group.id);

    const res = await app.inject({ method: "DELETE", url: `/api/classes/${group.id}`, headers: admin.auth });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("CLASS_NOT_EMPTY");
  });

  test("an empty class can", async () => {
    const group = await createClass(orgId, { grade: "4", section: "Z" });
    expect((await app.inject({ method: "DELETE", url: `/api/classes/${group.id}`, headers: admin.auth })).statusCode).toBe(200);
    expect((await get(`/api/classes/${group.id}`)).statusCode).toBe(404);
  });

  test("another school's class is a 404", async () => {
    const outside = await createClass((await createOrg()).id);
    expect((await get(`/api/classes/${outside.id}`)).statusCode).toBe(404);
  });
});

describe("adding students", () => {
  let classId: string;
  beforeAll(async () => { classId = (await createClass(orgId, { grade: "11", section: "A" })).id; });

  test("adding a student returns them AND a printable card token", async () => {
    const res = await post("/api/students", { classId, rollNo: "1", name: "Aarav Shah", gender: "male" });
    expect(res.statusCode).toBe(201);
    expect(res.json().student).toMatchObject({ rollNo: "1", name: "Aarav Shah", isActive: true });
    expect(res.json().card.token).toBeString();
  });

  test("the same roll number twice in one class → 409", async () => {
    const res = await post("/api/students", { classId, rollNo: "1", name: "Someone Else" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ROLL_NO_TAKEN");
  });

  // every class has a roll 1 — uniqueness is per class, not per school
  test("the same roll number in a different class is fine", async () => {
    const other = await createClass(orgId, { grade: "11", section: "B" });
    expect((await post("/api/students", { classId: other.id, rollNo: "1", name: "Different Class" })).statusCode).toBe(201);
  });

  test("teachers can read the roster but not add to it", async () => {
    expect((await get(`/api/classes/${classId}/students`, teacher)).statusCode).toBe(200);
    expect((await post("/api/students", { classId, rollNo: "99", name: "Nope" }, teacher)).statusCode).toBe(403);
  });

  test("adding into another school's class → 404", async () => {
    const outside = await createClass((await createOrg()).id);
    expect((await post("/api/students", { classId: outside.id, rollNo: "1", name: "Outsider" })).statusCode).toBe(404);
  });

  test("the roster comes back in roll-number order, not alphabetical string order", async () => {
    const group = await createClass(orgId, { grade: "12", section: "A" });
    for (const rollNo of ["10", "2", "1"]) {
      await post("/api/students", { classId: group.id, rollNo, name: `Roll ${rollNo}` });
    }
    const res = await get(`/api/classes/${group.id}/students`);
    expect(res.json().map((s: { rollNo: string }) => s.rollNo)).toEqual(["1", "2", "10"]);
  });
});

describe("CSV import", () => {
  let classId: string;
  beforeAll(async () => { classId = (await createClass(orgId, { grade: "Import", section: "A" })).id; });

  test("imports a whole class, each with their own card", async () => {
    const rows = [
      { rollNo: "1", name: "Asha Karki", gender: "female" },
      { rollNo: "2", name: "Bikash Rai", gender: "male" },
      { rollNo: "3", name: "Chandra Lama" },
    ];
    const res = await post("/api/students/import", { classId, rows });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ imported: 3, skippedCount: 0 });
    expect(res.json().created.every((c: { card: { token: string } }) => typeof c.card.token === "string")).toBe(true);
    expect(new Set(res.json().created.map((c: { card: { token: string } }) => c.card.token)).size).toBe(3); // no two students share a token
  });

  // re-uploading a corrected sheet must not fail wholesale, or the office is stuck
  test("rows whose roll number is taken are skipped; the rest still import", async () => {
    const res = await post("/api/students/import", {
      classId,
      rows: [{ rollNo: "2", name: "Bikash Rai" }, { rollNo: "4", name: "Deepa Thapa" }],
    });
    expect(res.json()).toMatchObject({ imported: 1, skippedCount: 1 });
    expect(res.json().skipped[0]).toMatchObject({ rollNo: "2" });
    expect(res.json().created[0].student.name).toBe("Deepa Thapa");
  });

  test("a duplicate inside the same file is caught too", async () => {
    const group = await createClass(orgId, { grade: "Import", section: "B" });
    const res = await post("/api/students/import", {
      classId: group.id,
      rows: [{ rollNo: "1", name: "First" }, { rollNo: "1", name: "Duplicate" }],
    });
    expect(res.json()).toMatchObject({ imported: 1, skippedCount: 1 });
  });

  test("an empty or oversized file is rejected", async () => {
    expect((await post("/api/students/import", { classId, rows: [] })).statusCode).toBe(400);

    const tooMany = Array.from({ length: 501 }, (_, i) => ({ rollNo: `x${i}`, name: `Student ${i}` }));
    expect((await post("/api/students/import", { classId, rows: tooMany })).statusCode).toBe(400);
  });

  test("a row with no name is rejected before anything is written", async () => {
    const group = await createClass(orgId, { grade: "Import", section: "C" });
    const res = await post("/api/students/import", { classId: group.id, rows: [{ rollNo: "1", name: "" }] });
    expect(res.statusCode).toBe(400);
    expect((await get(`/api/classes/${group.id}/students`)).json()).toHaveLength(0);
  });
});

describe("printing a class's cards", () => {
  let classId: string;
  beforeAll(async () => { classId = (await createClass(orgId, { grade: "Cards", section: "A" })).id; });

  test("by default it only covers students who have no working card", async () => {
    await createStudent(orgId, classId); // already holds a card from being added
    const res = await post(`/api/classes/${classId}/cards`, {});
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ issued: 0, skipped: 1 });
  });

  test("a student whose card was revoked gets a new one", async () => {
    const { card } = await createStudent(orgId, classId);
    await app.inject({ method: "PATCH", url: `/api/qr/credentials/${card.id}/revoke`, headers: admin.auth });

    const res = await post(`/api/classes/${classId}/cards`, {});
    expect(res.json().issued).toBe(1);
    expect(res.json().cards[0].card.token).toBeString();
  });

  // a fresh batch of physical cards: everything already out there must stop working
  test("only:all reprints the class and kills the old cards", async () => {
    const group = await createClass(orgId, { grade: "Cards", section: "B" });
    const first = await createStudent(orgId, group.id);

    const res = await post(`/api/classes/${group.id}/cards`, { only: "all" });
    expect(res.json().issued).toBe(1);

    const session = (await post("/api/attendance/sessions", { title: "Reprint", closesAt: new Date(Date.now() + 3_600_000).toISOString() }, teacher)).json();
    const old = await post("/api/qr/scan", { sessionId: session.id, token: first.card.token }, teacher);
    expect(old.json().code).toBe("QR_REVOKED");
    expect((await post("/api/qr/scan", { sessionId: session.id, token: res.json().cards[0].card.token }, teacher)).statusCode).toBe(201);
  });

  test("teachers cannot print cards", async () => {
    expect((await post(`/api/classes/${classId}/cards`, {}, teacher)).statusCode).toBe(403);
  });
});

describe("editing students", () => {
  let classId: string;
  beforeAll(async () => { classId = (await createClass(orgId, { grade: "Edit", section: "A" })).id; });

  test("rename and fix a roll number", async () => {
    const { student } = await createStudent(orgId, classId, { name: "Mispelled Nmae" });
    const res = await app.inject({ method: "PATCH", url: `/api/students/${student.id}`, headers: admin.auth, payload: { name: "Correct Name", rollNo: "77" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Correct Name", rollNo: "77" });
  });

  test("moving a student to another class carries their card with them", async () => {
    const target = await createClass(orgId, { grade: "Edit", section: "B" });
    const { student, card } = await createStudent(orgId, classId);

    const res = await app.inject({ method: "PATCH", url: `/api/students/${student.id}`, headers: admin.auth, payload: { classId: target.id } });
    expect(res.json().class).toMatchObject({ id: target.id, label: "Edit B" });

    const session = (await post("/api/attendance/sessions", { title: "Moved", closesAt: new Date(Date.now() + 3_600_000).toISOString() }, teacher)).json();
    const scan = await post("/api/qr/scan", { sessionId: session.id, token: card.token }, teacher);
    expect(scan.statusCode).toBe(201);
    expect(scan.json().student.class.label).toBe("Edit B");
  });

  test("moving into a class that already uses that roll number → 409", async () => {
    const target = await createClass(orgId, { grade: "Edit", section: "C" });
    await post("/api/students", { classId: target.id, rollNo: "5", name: "Sitting There" });
    const mine = (await post("/api/students", { classId, rollNo: "5", name: "Moving In" })).json();

    const res = await app.inject({ method: "PATCH", url: `/api/students/${mine.student.id}`, headers: admin.auth, payload: { classId: target.id } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("ROLL_NO_TAKEN");
  });

  test("search finds a student by name or by roll number", async () => {
    await post("/api/students", { classId, rollNo: "4242", name: "Findable Person" });

    expect((await get("/api/students?q=Findable")).json()).toHaveLength(1);
    expect((await get("/api/students?q=4242")).json()).toHaveLength(1);
    expect((await get("/api/students?q=nobody-by-this-name")).json()).toHaveLength(0);
  });

  test("a student who left drops out of the roster but keeps their row", async () => {
    const group = await createClass(orgId, { grade: "Edit", section: "D" });
    const { student } = await createStudent(orgId, group.id);
    await app.inject({ method: "PATCH", url: `/api/students/${student.id}`, headers: admin.auth, payload: { isActive: false } });

    expect((await get(`/api/students?classId=${group.id}`)).json()).toHaveLength(0);
    expect((await get(`/api/students?classId=${group.id}&includeInactive=true`)).json()).toHaveLength(1);
    // and they stop counting against the class's attendance
    expect((await get(`/api/attendance/register?classId=${group.id}`)).json().total).toBe(0);
  });

  test("another school's student is a 404 to read and to edit", async () => {
    const other = await createOrg();
    const outside = await createStudent(other.id, (await createClass(other.id)).id);

    expect((await get(`/api/students/${outside.student.id}`)).statusCode).toBe(404);
    const patch = await app.inject({ method: "PATCH", url: `/api/students/${outside.student.id}`, headers: admin.auth, payload: { name: "Hijacked" } });
    expect(patch.statusCode).toBe(404);
  });
});

// a real class is 30-40 students, and the batch runs in ONE transaction — worth proving at size
describe("printing a full-size class", () => {
  test("40 students each get their own working card", async () => {
    const group = await createClass(orgId, { grade: "Big", section: "A" });
    const rows = Array.from({ length: 40 }, (_, i) => ({ rollNo: String(i + 1), name: `Student ${i + 1}` }));
    expect((await post("/api/students/import", { classId: group.id, rows })).json().imported).toBe(40);

    const batch = (await post(`/api/classes/${group.id}/cards`, { only: "all" })).json();
    expect(batch.issued).toBe(40);
    expect(new Set(batch.cards.map((c: { card: { token: string } }) => c.card.token)).size).toBe(40);
    // each token belongs to the student it was printed for, in the order asked for
    expect(batch.cards.map((c: { student: { rollNo: string } }) => c.student.rollNo).slice(0, 3)).toEqual(["1", "2", "3"]);

    const session = (await post("/api/attendance/sessions", { title: "Big class", closesAt: new Date(Date.now() + 3_600_000).toISOString() }, teacher)).json();
    for (const entry of batch.cards) {
      const res = await post("/api/qr/scan", { sessionId: session.id, token: entry.card.token }, teacher);
      expect(res.statusCode).toBe(201);
      expect(res.json().student.rollNo).toBe(entry.student.rollNo);
    }
    expect((await get(`/api/attendance/register?classId=${group.id}`)).json()).toMatchObject({ present: 40, absent: 0 });
  });
});
