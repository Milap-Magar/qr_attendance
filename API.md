# API Reference

Base URL: `http://localhost:3001`. All bodies are JSON. Protected routes need
`Authorization: Bearer <accessToken>`.

**Multi-tenant.** Every school or college is an *organization*. Every user (except `system`) belongs to exactly
one, and every endpoint below works on **the caller's own organization only**. Another school's classes,
students, sessions and cards behave as if they don't exist (404). The access token carries the caller's `orgId`.

**Students are not accounts.** Only staff log in. A school creates *classes* (grade + section + academic
year) and adds *students* to them; each student gets one permanent QR card the moment they are added, and
identifies themselves by holding it up. There is no student sign-up, no student password, no student login.

**Attendance is per day.** The first scan into any open session marks a student present for that day.
Any teacher may scan any student — class and roll number are for grouping and sorting reports, not for
restricting who may scan. Which calendar day a scan counts for is decided by the **school's timezone**.

## 1. How auth works

```
┌──────────┐  POST /api/auth/login              ┌──────────┐
│ frontend │ ─────────────────────────────────▶ │  server  │
│          │ ◀── { user, accessToken,           │          │
│          │       refreshToken }               │          │
│          │                                    │          │
│          │  GET /api/... + Bearer accessToken │          │
│          │ ─────────────────────────────────▶ │          │
│          │ ◀── 200 ... (15 min later) ── 401  │          │
│          │                                    │          │
│          │  POST /api/auth/refresh            │          │
│          │  { refreshToken }                  │          │
│          │ ─────────────────────────────────▶ │  old refresh token is revoked
│          │ ◀── { accessToken, refreshToken }  │  (each refresh token works ONCE)
│          │  retry the request                 │          │
└──────────┘                                    └──────────┘
```

| Token | Lifetime | Where it's sent | Stored on server? |
|---|---|---|---|
| `accessToken` (JWT) | 15 min (`ACCESS_TOKEN_TTL`) | every request, `Authorization` header | no, verified by signature |
| `refreshToken` (random) | 7 days (`REFRESH_TOKEN_TTL_DAYS`) | only `/refresh` and `/logout` | yes, hashed, in `refresh_tokens` |

**Frontend rules**
- On **401** from any route: call `/api/auth/refresh` once, save the new pair, retry the request.
  If refresh also returns 401, the user must log in again.
- Always save **the new** `refreshToken` from `/refresh`. The old one stops working.
- If several requests get 401 at the same time, share **one** refresh call between them.
  A second refresh with the same token gets 401.
- **403** means "logged in, but not allowed". Show a message, don't log out.

Minimal fetch wrapper:

```ts
let refreshing: Promise<boolean> | null = null;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(`http://localhost:3001${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.accessToken}`, ...init.headers },
  });

  let res = await send();
  if (res.status !== 401 || path.startsWith("/api/auth/")) return res;

  // one refresh for everyone who got a 401
  refreshing ??= fetch("http://localhost:3001/api/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: localStorage.refreshToken }),
  }).then(async (r) => {
    if (!r.ok) return false;
    const { accessToken, refreshToken } = await r.json();
    Object.assign(localStorage, { accessToken, refreshToken });
    return true;
  }).finally(() => (refreshing = null));

  if (await refreshing) res = await send();
  else { localStorage.clear(); location.href = "/login"; }
  return res;
}
```

## 2. Errors

Every error has the same shape:

```json
{ "message": "Human readable, safe to show", "code": "MACHINE_READABLE" }
```

Validation errors (400) add `errors`, the messages per field, for highlighting form inputs:

```json
{ "message": "Invalid Email format", "code": "VALIDATION_ERROR", "errors": { "email": ["Invalid Email format"] } }
```

| Status | Meaning |
|---|---|
| 400 | bad input (`VALIDATION_ERROR`, `INVALID_ORGANIZATION`) |
| 401 | not logged in / token expired (`UNAUTHORIZED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`) |
| 403 | logged in but not allowed (`FORBIDDEN`, `NO_ORGANIZATION`), or revoked QR card (`QR_REVOKED`) |
| 403 | also: student no longer enrolled (`STUDENT_INACTIVE`) |
| 404 | not found, or belongs to another school (`USER_NOT_FOUND`, `STUDENT_NOT_FOUND`, `CLASS_NOT_FOUND`, `SESSION_NOT_FOUND`, `QR_NOT_FOUND`, `CREDENTIAL_NOT_FOUND`, `INVALID_JOIN_CODE`, `ORGANIZATION_NOT_FOUND`) |
| 409 | conflict (`EMAIL_TAKEN`, `ALREADY_PRESENT`, `CLASS_EXISTS`, `CLASS_NOT_EMPTY`, `ROLL_NO_TAKEN`, `SESSION_NOT_OPEN`, `SESSION_CLOSED`) |


## 3. Roles

Only staff have accounts.

| Role | Belongs to | Can |
|---|---|---|
| `teachers` | a school | read classes, rosters and reports; open/close sessions; **scan** |
| `admin` | a school | + create classes, add students, issue/revoke QR cards, add staff, edit the school |
| `system` | **no school** | the platform operator: sees every school (`GET /api/organizations`), nothing inside them |
| `users` | a school | **legacy.** Students used to be accounts. Nothing creates one; existing rows can log in and see only their own profile |

The person who signs a school up becomes its first `admin`. `system` accounts are only made with the CLI.

`GET /api/users/me` returns `permissions`. Use it to show/hide buttons.
The policy lives in `src/modules/rbac/rbac.constants.ts`.

Permissions: `users:read` `users:create` `users:update` `users:delete` `profile:read` `profile:update`
`classes:read` `classes:manage` `students:read` `students:manage` `reports:read` `credentials:manage`
`sessions:manage` `attendance:scan` `organization:manage` `platform:manage`.

## 4. Endpoints

### Auth: `/api/auth`

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/register-school` | `{ schoolName, schoolType?, name, email, password, gender? }` | 201 `{ user, organization, accessToken, refreshToken }`. The caller is the school's `admin` |
| POST | `/login` | `{ email, password }` | 200 `{ user, accessToken, refreshToken }` |
| POST | `/refresh` | `{ refreshToken }` | 200 `{ user, accessToken, refreshToken }` |
| POST | `/logout` | `{ refreshToken }` | 204 |

There is **no** `/register`: students aren't accounts, and staff are created by an admin via `POST /api/users`.

Password rule: 8+ chars with upper, lower, number and one of `#?!@$%^&*-`.
`gender`: `male | female | other`. `schoolType`: `school | college | university | other` (default `school`).
Emails are unique across the whole platform.

### Classes: `/api/classes`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| GET | `/` | `classes:read` | `?academicYear=&grade=` | class[] |
| GET | `/academic-years` | `classes:read` | | `string[]`, newest first |
| POST | `/` | `classes:manage` | `{ grade, section?, academicYear }` | 201 class, or 409 `CLASS_EXISTS` |
| GET | `/:id` | `classes:read` | | class |
| GET | `/:id/students` | `students:read` | | student[] in roll-number order (includes students who left) |
| POST | `/:id/cards` | `credentials:manage` | `{ only?: "missing" \| "all" }` | 201 card batch (see below) |
| PATCH | `/:id` | `classes:manage` | `{ grade?, section?, academicYear? }` | class |
| DELETE | `/:id` | `classes:manage` | | `{ id }`, or 409 `CLASS_NOT_EMPTY` |

Class object: `{ id, organizationId, grade, section, academicYear, createdAt, studentCount, label }`.
`label` is `"10 A"`, or just `"10"` when `section` is `""`. A class is unique per
`(school, grade, section, academicYear)`, so next year's "10 A" is a separate roster.

### Students: `/api/students`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| GET | `/` | `students:read` | `?classId=&q=&includeInactive=true` (`q` matches name or roll no) | student[] |
| POST | `/` | `students:manage` | `{ classId, rollNo, name, gender? }` | 201 `{ student, card }`, or 409 `ROLL_NO_TAKEN` |
| POST | `/import` | `students:manage` | `{ classId, rows: [{ rollNo, name, gender? }] }` (1–500) | 201 import result |
| GET | `/:id` | `students:read` | | student |
| PATCH | `/:id` | `students:manage` | `{ name?, rollNo?, gender?, classId?, isActive? }` | student |
| DELETE | `/:id` | `students:manage` | | `{ id }` |

Student object:
`{ id, organizationId, classId, rollNo, name, gender, isActive, createdAt, class: { id, grade, section, academicYear, label }, hasActiveCard }`

- **Roll numbers are unique within a class**, not within the school — every class has a roll "1".
  They are text, so `"07"` and `"2026/007"` are kept exactly as typed, and lists sort `1, 2, 10`, not `1, 10, 2`.
- **Adding a student issues their QR card in the same transaction.** Both happen or neither does.
- A student who **left**: `PATCH { isActive: false }`. They keep their attendance history, drop off the
  roster, and their card stops scanning (403 `STUDENT_INACTIVE`). `DELETE` is for a row added by mistake —
  it takes the card and the history with it.

Import result: `{ imported, skippedCount, created: [{ student, card }], skipped: [{ rollNo, name, reason }] }`.
A row whose roll number is already taken (in the class, or earlier in the same file) is skipped and the rest
still import, so re-uploading a corrected sheet does the right thing. Rows that fail *validation* (a missing
name, say) reject the whole request with 400 before anything is written.

### QR cards + scanning: `/api/qr`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| POST | `/credentials` | `credentials:manage` | `{ studentId }` | 201 `{ id, studentId, createdAt, revokedAt, token }` |
| GET | `/credentials` | `credentials:manage` | `?studentId=` | credential[] (no token) |
| PATCH | `/credentials/:id/revoke` | `credentials:manage` | | credential |
| POST | `/scan` | `attendance:scan` | `{ sessionId, token }` | 201 `{ message, student, session, record }` |

- **`token` is returned only once**, when the card is issued — by `POST /api/students`,
  `POST /api/students/import`, `POST /api/classes/:id/cards` or `POST /api/qr/credentials`. The server keeps
  only its sha256 hash, so it can never be fetched again. Render it as a QR and print it *now*.
- A student has **at most one active card**. Issuing a new one revokes the old, so a lost card that someone
  else picks up stops working the moment a replacement is printed.
- The QR contains just the token string. The scanner decodes it and posts it as `token`.

Batch printing — `POST /api/classes/:id/cards` → `{ class, issued, skipped, cards: [{ student, card }] }`:

| `only` | Does |
|---|---|
| `"missing"` (default) | issues only for students with no working card. Safe to re-run; cards already in students' hands keep working |
| `"all"` | reissues the whole class and **revokes every existing card**. For a fresh batch of physical cards |

Scan responses:

| Result | Status | code |
|---|---|---|
| marked present | 201 | |
| already present today (any session) | 409 | `ALREADY_PRESENT` — the message names the student and the time |
| session not started yet / already over | 409 | `SESSION_NOT_OPEN` / `SESSION_CLOSED` |
| QR not recognised (or another school's card) | 404 | `QR_NOT_FOUND` |
| card revoked | 403 | `QR_REVOKED` |
| student no longer enrolled | 403 | `STUDENT_INACTIVE` |
| session id doesn't exist (or is another school's) | 404 | `SESSION_NOT_FOUND` |

`ALREADY_PRESENT` is **not an error to fix** — the student *is* present. Show it calmly (amber, not red)
and wave the queue along.

Scan success payload:

```json
{
  "message": "Marked present",
  "student": { "id": "…", "name": "Sita Rai", "rollNo": "7", "isActive": true,
               "class": { "id": "…", "grade": "10", "section": "A", "label": "10 A" } },
  "session": { "id": "…", "title": "Morning" },
  "record":  { "id": "…", "scannedAt": "2026-09-12T03:20:11.000Z", "attendanceDate": "2026-09-12" }
}
```

### Attendance: `/api/attendance`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| POST | `/sessions` | `sessions:manage` | `{ title, closesAt, opensAt? }` (ISO dates; `opensAt` defaults to now) | 201 session |
| GET | `/sessions` | `sessions:manage` | | session[] (newest first) |
| GET | `/sessions/:id` | `sessions:manage` | | session |
| PATCH | `/sessions/:id/close` | `sessions:manage` | (none) | session |
| GET | `/sessions/:id/records` | `reports:read` | | scan[] in scan order |
| GET | `/register` | `reports:read` | `?classId=<uuid>&date=YYYY-MM-DD` | **the daily register** |
| GET | `/summary` | `reports:read` | `?date=YYYY-MM-DD` | every class's tally for one day |
| GET | `/students/:id` | `reports:read` | | that student's history, newest day first |

`date` is optional everywhere and defaults to **today in the school's timezone**.

Session object: `{ id, title, openedBy, opensAt, closesAt, createdAt, checkedInCount, status }`.
`status` is `"upcoming" | "open" | "closed"`, computed from the server clock. Scans are accepted only while `open`.

`GET /register` — the report the school actually wants. It starts from the roster, so **absences are
visible**: a student with no scan that day simply comes back `present: false`.

```json
{
  "date": "2026-09-12",
  "class": { "id": "…", "label": "10 A", "academicYear": "2026" },
  "present": 28, "absent": 2, "total": 30,
  "students": [
    { "id": "…", "rollNo": "1", "name": "Aarav Shah", "gender": "male",
      "present": true, "scannedAt": "2026-09-12T03:20:11.000Z", "sessionId": "…" },
    { "id": "…", "rollNo": "2", "name": "Asha Karki", "gender": "female",
      "present": false, "scannedAt": null, "sessionId": null }
  ]
}
```

`GET /summary` → `{ date, present, total, classes: [{ id, grade, section, academicYear, label, total, present, absent }] }`

### Organizations (schools): `/api/organizations`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| GET | `/lookup` | **public** | `?code=K7QM-X2PD` | `{ id, name, type }`, or 404 `INVALID_JOIN_CODE` |
| GET | `/current` | anyone in a school | | `{ id, name, type, timezone, createdAt }`, plus `joinCode` for admins |
| PATCH | `/current` | `organization:manage` | `{ name?, type?, timezone? }` | organization |
| POST | `/current/join-code` | `organization:manage` | | organization with a **new** `joinCode` |
| GET | `/` | `platform:manage` (system) | | every school: `{ …, students, staff, sessions }[]` |

**`timezone`** is an IANA name (`Asia/Kathmandu`, default `UTC`) and decides when one school day ends and the
next begins — i.e. when "present once today" resets. An unknown name is rejected with 400. Get it right
before the first real scan, or attendance lands on the wrong date.

> The **join code** is a leftover from when students signed themselves up. Nothing uses it now; it is kept
> so the column and the admin screen don't need a migration. Ignore it, or repurpose it for staff invites.

### Users (staff): `/api/users`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| GET | `/me` | anyone logged in | | user + `organization` (`{ id, name, type }` or `null`) + `permissions[]` |
| GET | `/` | `users:read` | `?role=admin\|teachers` | staff[] (your school; legacy student rows are never listed) |
| GET | `/:id` | yourself, or `users:read` | | user |
| POST | `/` | `users:create` (admin) | `{ name, email, password, gender?, role? }` (`role`: `admin \| teachers`, default `teachers`) | 201 user |
| PATCH | `/:id` | yourself, or `users:update` | `{ name?, gender? }` | user |

User object: `{ id, name, email, gender, role, organizationId, isActive, createdAt }`

## 5. Try it with curl

```bash
B=localhost:3001/api; J='content-type: application/json'

# 1. a school signs up → you're its admin, already logged in
SIGNUP=$(curl -s $B/auth/register-school -H "$J" \
  -d '{"schoolName":"Sunrise Academy","name":"Gita Sharma","email":"admin@school.com","password":"Admin@123"}')
AT=$(echo $SIGNUP | jq -r .accessToken); RT=$(echo $SIGNUP | jq -r .refreshToken)
H="authorization: Bearer $AT"

# 2. set the school's timezone — this decides which day a scan counts for
curl -s -X PATCH $B/organizations/current -H "$J" -H "$H" -d '{"timezone":"Asia/Kathmandu"}' | jq -r .timezone

# 3. create a class
CLASS=$(curl -s $B/classes -H "$J" -H "$H" -d '{"grade":"10","section":"A","academicYear":"2026"}' | jq -r .id)

# 4. add a class of students in one go → each comes back with a one-time card token to print
curl -s $B/students/import -H "$J" -H "$H" -d "{\"classId\":\"$CLASS\",\"rows\":[
  {\"rollNo\":\"1\",\"name\":\"Aarav Shah\",\"gender\":\"male\"},
  {\"rollNo\":\"2\",\"name\":\"Asha Karki\",\"gender\":\"female\"}]}" | jq '{imported, skippedCount}'

# 5. one more student on their own → { student, card }; card.token goes inside the printed QR
CARD=$(curl -s $B/students -H "$J" -H "$H" \
  -d "{\"classId\":\"$CLASS\",\"rollNo\":\"3\",\"name\":\"Sita Rai\"}" | jq -r .card.token)

# 6. open a session for the next hour
SESSION=$(curl -s $B/attendance/sessions -H "$J" -H "$H" \
  -d "{\"title\":\"Morning\",\"closesAt\":\"$(date -u -d '+1 hour' +%FT%TZ)\"}" | jq -r .id)

# 7. scan (what the laptop does after reading the QR) → 201, then again → 409 ALREADY_PRESENT
curl -s $B/qr/scan -H "$J" -H "$H" -d "{\"sessionId\":\"$SESSION\",\"token\":\"$CARD\"}" | jq
curl -s $B/qr/scan -H "$J" -H "$H" -d "{\"sessionId\":\"$SESSION\",\"token\":\"$CARD\"}" | jq -r .code

# 8. the register: who was present, who was absent, by roll number
curl -s "$B/attendance/register?classId=$CLASS" -H "$H" | jq '{present, absent, total}'
curl -s "$B/attendance/register?classId=$CLASS" -H "$H" | jq -r '.students[] | "\(.rollNo)\t\(.name)\t\(if .present then "P" else "A" end)"'

# 9. refresh the tokens (the old $RT stops working), then log out
curl -s $B/auth/refresh -H "$J" -d "{\"refreshToken\":\"$RT\"}" | jq
```
