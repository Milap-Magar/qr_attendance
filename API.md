# API Reference

Base URL: `http://localhost:3001`. All bodies are JSON. Protected routes need
`Authorization: Bearer <accessToken>`.

**Multi-tenant.** Every school or college is an *organization*. Every user (except `system`) belongs to exactly
one, and every endpoint below works on **the caller's own organization only**. Another school's users,
sessions and cards behave as if they don't exist (404). The access token carries the caller's `orgId`.

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
| 404 | not found, or belongs to another school (`USER_NOT_FOUND`, `SESSION_NOT_FOUND`, `QR_NOT_FOUND`, `CREDENTIAL_NOT_FOUND`, `INVALID_JOIN_CODE`, `ORGANIZATION_NOT_FOUND`) |
| 409 | conflict (`EMAIL_TAKEN`, `ALREADY_SCANNED`, `SESSION_NOT_OPEN`, `SESSION_CLOSED`) |

## 3. Roles

| Role | Belongs to | Can |
|---|---|---|
| `users` (students) | a school | own profile, own attendance history, show own QR on phone |
| `teachers` | a school | + list/edit the school's users, open/close sessions, **scan** |
| `admin` | a school | + add users, issue/revoke QR cards, see who checked in, edit the school + its join code |
| `system` | **no school** | the platform operator: sees every school (`GET /api/organizations`), nothing inside them |

The person who signs a school up becomes its first `admin`. `system` accounts are only made with the CLI.

`GET /api/users/me` returns `permissions`. Use it to show/hide buttons.
The policy lives in `src/modules/rbac/rbac.constants.ts`.

## 4. Endpoints

### Auth: `/api/auth`

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/register-school` | `{ schoolName, schoolType?, name, email, password, gender? }` | 201 `{ user, organization, accessToken, refreshToken }`. The caller is the school's `admin` |
| POST | `/register` | `{ name, email, password, joinCode, gender? }` | 201 `{ user, accessToken, refreshToken }`. Always a student (`users`) of the school that owns `joinCode` |
| POST | `/login` | `{ email, password }` | 200 `{ user, accessToken, refreshToken }` |
| POST | `/refresh` | `{ refreshToken }` | 200 `{ user, accessToken, refreshToken }` |
| POST | `/logout` | `{ refreshToken }` | 204 |

Password rule (register/create): 8+ chars with upper, lower, number and one of `#?!@$%^&*-`.
`gender`: `male | female | other`. `schoolType`: `school | college | university | other` (default `school`).
`joinCode` accepts any case and dashes/spaces (`k7qm-x2pd` = `K7QMX2PD`). Emails are unique across the whole platform.

### Users: `/api/users`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| GET | `/me` | anyone logged in | | user + `organization` (`{ id, name, type }` or `null`) + `permissions[]` |
| GET | `/` | `users:read` | `?role=users` (optional) | user[] (your school) |
| GET | `/:id` | yourself, or `users:read` | | user |
| POST | `/` | `users:create` (admin) | `{ name, email, password, gender?, role? }` (`role`: `admin \| teachers \| users`) | 201 user, in your school |
| PATCH | `/:id` | yourself, or `users:update` | `{ name?, gender? }` | user |

User object: `{ id, name, email, gender, role, organizationId, isActive, createdAt }`

### Organizations (schools): `/api/organizations`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| GET | `/lookup` | **public** | `?code=K7QM-X2PD` | `{ id, name, type }`, or 404 `INVALID_JOIN_CODE` |
| GET | `/current` | anyone in a school | | `{ id, name, type, createdAt }`, plus `joinCode` for admins |
| PATCH | `/current` | `organization:manage` (admin) | `{ name?, type? }` | organization (with `joinCode`) |
| POST | `/current/join-code` | `organization:manage` (admin) | | organization with a **new** `joinCode`; the old one stops working |
| GET | `/` | `platform:manage` (system) | | every school: `{ id, name, type, joinCode, createdAt, students, staff, sessions }[]` |

Share the join code with students as a link: `<frontend>/register?code=<joinCode>`. Regenerating the code
doesn't affect students who already joined.

### QR cards + scanning: `/api/qr`

| Method | Path | Who | Body / query | Returns |
|---|---|---|---|---|
| POST | `/credentials` | admin | `{ userId }` (a user in your school) | 201 `{ id, userId, method, createdAt, revokedAt, token }` (printed card) |
| POST | `/credentials/me` | students (`qr:self`) | | 201 same shape, `method: "device"` (phone QR) |
| GET | `/credentials` | admin | `?userId=` (optional) | credential[] (no token) |
| PATCH | `/credentials/:id/revoke` | admin | | credential |
| POST | `/scan` | teachers, admin | `{ sessionId, token }` | 201 `{ message, student, session, record }` |

- **`token` is returned only once**, when the card is issued. Render it as a QR code (e.g. the `qrcode` npm
  package) and print it. The server stores only a hash. Lost card → issue a new one.
- A student has at most **one active card and one active phone**. Issuing a new card revokes only the
  previous card; setting up a new phone (`/credentials/me`) revokes only the previous phone.
- The QR code contains just the token string. The scanner decodes it and sends it as `token`.

Scan responses:

| Result | Status | code |
|---|---|---|
| checked in | 201 | |
| already checked in to this session | 409 | `ALREADY_SCANNED` |
| session not started yet / already over | 409 | `SESSION_NOT_OPEN` / `SESSION_CLOSED` |
| QR not recognised (or it's another school's card) | 404 | `QR_NOT_FOUND` |
| card revoked | 403 | `QR_REVOKED` |
| session id doesn't exist (or is another school's) | 404 | `SESSION_NOT_FOUND` |

### Attendance: `/api/attendance`

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| POST | `/sessions` | teachers, admin | `{ title, closesAt, opensAt? }` (ISO dates; `opensAt` defaults to now) | 201 session |
| GET | `/sessions` | teachers, admin | | session[] (newest first) |
| GET | `/sessions/:id` | teachers, admin | | session |
| PATCH | `/sessions/:id/close` | teachers, admin | (none) | session |
| GET | `/sessions/:id/records` | admin | | `{ id, scannedAt, scannedBy, student: { id, name, email } }[]` |
| GET | `/me` | anyone logged in | | `{ id, scannedAt, session: { id, title, opensAt } }[]` |

Session object: `{ id, title, openedBy, opensAt, closesAt, createdAt, checkedInCount, status }`.
`status` is `"upcoming" | "open" | "closed"`, computed from the server clock. Scans are accepted only while `open`.

## 5. Try it with curl

```bash
B=localhost:3001/api; J='content-type: application/json'

# 1. a school signs up → you're its admin, already logged in
SIGNUP=$(curl -s $B/auth/register-school -H "$J" \
  -d '{"schoolName":"Sunrise Academy","name":"Gita Sharma","email":"admin@school.com","password":"Admin@123"}')
AT=$(echo $SIGNUP | jq -r .accessToken); RT=$(echo $SIGNUP | jq -r .refreshToken)
CODE=$(echo $SIGNUP | jq -r .organization.joinCode)
H="authorization: Bearer $AT"

# 2. a student joins the school with its join code
STUDENT=$(curl -s $B/auth/register -H "$J" \
  -d "{\"name\":\"Sita Kumari\",\"email\":\"sita@school.com\",\"password\":\"Sita@1234\",\"joinCode\":\"$CODE\"}" | jq -r .user.id)

# 3. admin issues the student's QR card → this token goes inside the printed QR
CARD=$(curl -s $B/qr/credentials -H "$J" -H "$H" -d "{\"userId\":\"$STUDENT\"}" | jq -r .token)

# 4. open a session for the next hour
SESSION=$(curl -s $B/attendance/sessions -H "$J" -H "$H" \
  -d "{\"title\":\"Physics\",\"closesAt\":\"$(date -u -d '+1 hour' +%FT%TZ)\"}" | jq -r .id)

# 5. scan (what the laptop does after reading the QR) → 201, then again → 409 ALREADY_SCANNED
curl -s $B/qr/scan -H "$J" -H "$H" -d "{\"sessionId\":\"$SESSION\",\"token\":\"$CARD\"}" | jq

# 6. who checked in
curl -s $B/attendance/sessions/$SESSION/records -H "$H" | jq

# 7. refresh the tokens (the old $RT stops working)
curl -s $B/auth/refresh -H "$J" -d "{\"refreshToken\":\"$RT\"}" | jq

# 8. logout
curl -s -i $B/auth/logout -H "$J" -d "{\"refreshToken\":\"<the latest refresh token>\"}"
```
