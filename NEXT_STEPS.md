# QR Attendance — Next Steps Checklist

**Updated:** 2026-09-11 · **State:** auth + refresh tokens ✅, users ✅, RBAC ✅, QR cards + scan ✅, attendance sessions/records ✅, zod validation ✅, tests ✅ (see API.md) · open: rate limiting, photo on scan, realtime, frontend

---

## 0. The model (settled)

**Physical ID card carries a static QR → student waves it at the laptop camera → laptop scans, validates
server-side, and displays the check-in. Admin-only visibility on the logs.**

Two rules that drive everything below:

1. **The card never expires — the *session* does.** You can't rotate ink on plastic, so the card token is
   permanent (but revocable). The time window lives on the attendance session the admin opens on the laptop.
2. **The server owns time.** The scanner decodes pixels and POSTs a string. It validates *nothing* —
   client clocks are spoofable and skewed. All expiry/window checks use the server's `now()`.

> **Assumption:** you're keeping the mobile-displayed QR *alongside* physical cards ("not only mobile").
> The design below covers both — a card is a static credential, a phone shows a rotating one, and both hit
> the same verify endpoint. If you decide cards-only, skip §7's student page and the `kind: 'device'` branch.

### Who is authenticated during a scan

The student is **not logged in** — they have no browser, no JWT, they just wave a card.
The JWT on `/api/qr/verify` belongs to the **operator** (admin/teacher running the scanner laptop).
This inverts your current `/verify` route, which assumes the scanner is the student.

---

## 1. Blockers — fix before anything else

- [ ] **Split the concepts.** `qr_sessions` is currently doing two incompatible jobs. Replace with:
Table - 1:
  - [ ] `credentials` — `id`, `user_id` FK, `token_hash` (unique), `method: 'card' | 'device'`, `created_at`, `revoked_at` (nullable). Permanent. This is the card.
Table - 2:
  - [ ] `attendance_sessions` — `id`, `title`, `opened_by` FK, `opens_at`, `closes_at`, `is_open`.
  -- created accoridngly --
--------------- This is what expires -----------------
============== IM HERE --- QR_SESSIONS not found issue // resolved ay ai THOOO!!
- [ ] **`getQr()` becomes card provisioning**, not self-serve. `POST /api/credentials` (admin only):
      "issue a card for student X", returns the token **once** for printing. You already hash before
      storing (`qr.services.ts`) — keep that, it's the right call.
- [ ] **Fix the expiry bug by relocating it** — `qr.services.ts:15` (`new Date(Date.now())`) disappears;
      `opens_at`/`closes_at` live on `attendance_sessions` instead.
- [ ] **JWTs never expire** — `auth.routes.ts:15` signs with no `expiresIn`, `index.ts:21` sets no `sign`
      defaults. Every token issued so far is valid forever. Set 15m–1h + a refresh token.
- [ ] **Role enum mismatch** — `common.types.ts:3` has `["system","admin","user","teacher"]`,
      DB (`schema.ts:6`) has `['system','admin','teachers','users']`. Creating a user with an explicit
      role will throw. Pick one spelling, add `as const`.
- [ ] **Typecheck fails** — `src/db/index.ts:7`, `process.env.DATABASE_URL` possibly `undefined`.

---

## 2. RBAC — code review (reviewed 2026-09-10)

Goal: only admins can see who checked in and when.

**Verdict: ~30% there.** The file layout is right and the permission vocabulary is a good instinct —
most people never get past `if (role === 'admin')`. But what's written is a *user lookup*, not access
control: nothing in `src/modules/rbac/` can currently deny a request. The one route that exists is
broken and unauthenticated. None of it is wasted — it's just that the guard, the one piece that makes
this module RBAC, hasn't been written yet.

### 🔴 Bugs — `GET /rbac/` cannot work as written

- [X] **`rbac.routes.ts:8` — `request.id` is not the user's id.** In Fastify, `request.id` is the
      *request* identifier: I ran it, the value is the string `"req-1"`. You then feed it to
      `where(eq(users.id, "req-1"))` against a `uuid` column, so Postgres throws
      `invalid input syntax for type uuid` and the route 500s on **every** call — it has never
      returned a role. The user id lives in the JWT: `(request.user as { userId: string }).userId`,
      the same cast `user.routes.ts:12` already does.
- [X] **`rbac.routes.ts:9` — the 404 branch sends nothing.** `if (data.status === 200)` with no
      `else`, so a missing user returns `undefined` from an async handler; Fastify never sends a
      reply and the connection hangs until the client times out. Always `return reply.send(...)` on
      every path.
- [ ] **The route has no `preHandler`.** Every other protected route wires `authMiddleware`; this one
      doesn't, so it's open to anonymous callers. Ironic for the auth module.
- [ ] **`rbac.types.ts:4` — `"techers"` typo**, and it disagrees with `rbac.constants.ts:4`
      (`"teachers"`) and with the DB enum. That's now **four** spellings of the role set across
      `schema.ts:5`, `common.types.ts:3`, `rbac.constants.ts`, `rbac.types.ts`. Any comparison against
      the typo'd type silently never matches — TypeScript will happily accept it because the strings
      are structurally fine.

### 🟠 Design — the parts that make it RBAC are missing

- [ ] **No guard exists.** `requireRole(...roles)` / `requirePermission(...perms)` returning a
      `preHandler` is the entire point of the module. Without it, §2's route lockdown below can't be
      done. Write this next, in `rbac.middleware.ts`.
- [ ] **`PERMISSIONS` is declared but never used.** Nothing maps a role to a permission set, so the
      constants are decoration. Add `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>` — that
      table *is* your policy, and having it in one file is what makes the whole approach pay off.
- [ ] **Decide role-based or permission-based and commit.** Both are half-built. P\\\\\\ermissions are the
      better call for this app (`reports:read` survives you adding a `staff` role; `role === 'admin'`
      scattered across 12 routes does not) — but pick one.
- [ ] **`rbac.types.ts` hand-retypes the constants.** Derive them so a typo becomes a compile error:
      ```ts
      export type Role = (typeof ROLES)[keyof typeof ROLES];
      export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
      ```
      This single change would have caught `"techers"` at build time.
- [ ] **`rbac.constants.ts:1` — `User` is the wrong name for a role map.** It reads like an entity.
      Call it `ROLES`.
- [ ] **`rbac.service.ts:9` — `db.select()` pulls the whole row**, password hash included, to read one
      column. Select `{ role: users.role }` explicitly. (The route only forwards `role` today, so
      nothing leaks yet — but this is the exact shape of accident that leaks later.)
- [ ] **`findById` duplicates `userServices.getUserById`.** Either drop it and call the user service,
      or narrow it to `getRole(userId)` so its purpose is unambiguous.
- [ ] **Is a DB round-trip per request the right choice?** You already sign `{userId, role}` into the
      JWT (`auth.routes.ts:15-18`), so the guard can read the role for free. The DB read is *more
      correct* (it sees demotions immediately) but costs a query on every request. Recommended split:
      trust the JWT claim for ordinary routes, re-read from DB only on the attendance-log and
      user-management routes. That resolves the stale-role item below.
- [ ] **`index.ts:51` — prefix is `/rbac`, not `/api/rbac`.** Every other module is under `/api`.

### 🟢 What's right

- Constants in a separate file with `as const`, rather than magic strings inline.
- Fine-grained `resource:action` permission naming — the correct vocabulary, and consistent.
- Splitting RBAC into its own module instead of burying it in `auth/`.
- The service returns a shaped `{status, message, data}` result, matching the rest of the codebase.

### Remaining work (unchanged from before)

- [ ] `requireRole(...roles)` guard factory, composed after `authMiddleware` in `preHandler`
- [ ] Role comes from the JWT payload — you already sign `{userId, role}`, good
- [ ] **Stale-role problem:** demote an admin and their existing token stays admin until expiry.
      Either short `expiresIn` (see §1) or re-read role from DB on the attendance-log routes specifically.
- [ ] Lock down the routes that are currently open to any logged-in user:
  - [ ] `GET /api/users` — full roster, admin only
  - [ ] `POST /api/users` — a student can currently create themselves an admin
  - [ ] `PATCH /api/users` — no ownership check; anyone can rename anyone
  - [ ] `POST /api/qr/verify` — admin/teacher (the scanner operator) only
  - [ ] `POST /api/credentials` — admin only
- [ ] Decide what `system` vs `admin` vs `teachers` actually mean before you scatter them through guards
- [ ] Return **403** for "valid token, wrong role" — distinct from 401. Your middleware only does 401.

### Order to fix, smallest first

```
1. unify the role enum (one source of truth, derive the TS types from it)
2. rbac.middleware.ts → requireRole / requirePermission
3. ROLE_PERMISSIONS map
4. fix or delete GET /rbac/ (it's a debug endpoint; /api/users/me already returns role)
5. apply the guard to the five routes above
```

> Honest note on step 4: `GET /rbac/` doesn't earn its place. `/api/users/me` already returns the role,
> and the client can read it from the JWT. Fixing it is fine; deleting it is also fine.

## 3. Attendance module — the actual feature

All four files in `src/modules/attendance/` are empty.

- [ ] `attendance.types.ts` — zod: `openSessionSchema`, `scanSchema`, `listLogsQuerySchema` (date range, userId)
- [ ] `attendance.services.ts`
  - [ ] `openSession(adminId, title, opensAt, closesAt)`
  - [ ] `closeSession(sessionId)`
  - [ ] `recordScan(token, sessionId)` — the core path, see below
  - [ ] `getLogs(filters)` — admin only
  - [ ] `getMyAttendance(userId)` — student's own history
- [ ] `attendance.routes.ts` + register under `/api/attendance` in `index.ts`
  - [ ] `POST /sessions` (admin) · `PATCH /sessions/:id/close` (admin)
  - [ ] `GET /sessions/:id/logs` (admin)
  - [ ] `GET /me` (any authenticated student)
- [ ] Schema: `attendance_logs` gains `session_id` FK and `credential_id` FK (traceability)
- [ ] Schema: **unique `(user_id, session_id)`** — this is your replay defense, don't skip it
- [ ] Do the lookup + insert in **one transaction**

### `recordScan` order of operations

```
1. hash incoming token
2. look up credential by hash        → 404 unknown card
3. credential.revoked_at is null?    → 401 card revoked
4. session exists and is_open?       → 409 no session open
5. server now() within window?       → 409 outside window   ← server time, not the scanner's
6. insert log, unique violation      → 409 already scanned in
7. return student name + PHOTO       → operator eyeballs it
```

---

## 4. Card security (static tokens — plan around it)

Expiry can't protect a permanent code, so:

- [ ] **Revocation** — `revoked_at` on the credential. Lost card → revoke → print a new one.
      This replaces expiry as your kill switch.
- [ ] **Session window** — a photographed code is useless outside class hours (§3 step 5)
- [ ] **One scan per session** — the unique constraint (§3) makes replay a no-op
- [ ] **Return the student's photo on scan** — the actual defense against a friend scanning your card.
      A human is standing there; let them compare face to screen. Add a `photo_url` to `users`.
- [ ] **Rate limit** `/verify` (`@fastify/rate-limit`) — stops brute-forcing the token space
- [ ] Keep tokens long and random — `randomBytes(32)` is already right
- [ ] (If you keep mobile) phone shows a rotating token, `kind: 'device'`, refreshed every ~30s.
      Same verify endpoint; only the rotation differs.
- [ ] (Later) HMAC-sign the printed payload so counterfeit cards can't be generated offline.
      Note this stops *forgery*, not *copying* — the photo check is still what catches copying.

---

## 5. Validation gaps

- [ ] **Your zod schemas are written but never run.** Every route does `request.body as SomeType` —
      a compile-time cast with zero runtime checking. Send `{"email": 123}` and it reaches the DB.
      Wire in `fastify-type-provider-zod`, or a `preValidation` hook doing `schema.parse(request.body)`.
      Affects `auth.routes.ts`, `user.routes.ts`, `qr.routes.ts`.
- [ ] `addUsers()` (`user.service.ts:36`) stores the password **unhashed** and returns the whole row
      including the hash. Reuse the bcrypt path from `authServices.register`; select explicit columns.
- [ ] `updateUsers()` (`user.service.ts:43-45`) — `db.select()` returns an array, so `if(selectedId)` is
      always true. The existence check does nothing.
- [ ] `auth.routes.ts` login error paths send `message: data` — ships the internal object to the client.
- [ ] Global `setErrorHandler` so an unexpected throw returns clean JSON, not a stack trace.

---

## 6. Realtime — "laptop showcases it"

- [ ] Add `@fastify/websocket`
- [ ] `WS /api/attendance/live?sessionId=…` — the scanner page and any admin dashboard subscribe
- [ ] On a successful scan, broadcast `{ name, photoUrl, scannedAt }`
- [ ] Auth the socket on `open` (JWT in the connect query) and enforce the same role guard as §2

---

## 7. Frontend

- [ ] **Scanner page (laptop, admin/teacher):** `getUserMedia` + `BarcodeDetector` (`jsQR` fallback)
      → POST `/verify` → big green/red result card **with the student's photo**
- [ ] Session controls on that page: open / close, live roster count
- [ ] **Admin dashboard:** attendance logs, filter by session and date range, CSV export
- [ ] *(Only if keeping mobile)* Student page: login → rotating QR canvas + countdown
- [ ] Serve via Bun HTML imports in `Bun.serve()` (per `CLAUDE.md`), no Vite
- [ ] Camera needs HTTPS (or `localhost`) — `getUserMedia` is blocked on plain http over LAN.
      Plan for a cert if the laptop hits the API by IP.

---

## 8. Cleanup

- [ ] **Delete `src/server.ts`** — stale copy of `index.ts` on port 3000. Two entry points will bite you.
- [ ] Delete or fill the empties: `src/app.ts`, `src/plugins/auth.ts`, `auth.schema.ts`,
      `users.schema.ts`, `qr.schema.ts`
- [ ] Split bootstrap: `src/app.ts` builds the Fastify instance, `src/server.ts` listens.
      Makes routes testable via `fastify.inject()` without binding a port.
- [ ] `package.json`: name is still `"fastify"`, no scripts. Add `dev` (`bun --hot index.ts`), `start`,
      `db:generate`, `db:migrate`.
- [ ] Drop `dotenv` and `tsx` — Bun loads `.env` natively and runs TS directly.
- [ ] Fill `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`) — it's empty and it's the only
      env file in git. ✅ `.env` itself is correctly gitignored.
- [ ] `users.is_Active` — capital A in the DB column (`schema.ts:23`) means quoted identifiers forever.
      Rename while the table is still empty.
- [ ] Make all timestamps `withTimezone: true` — only `users.created_at` is, and you're about to do a lot
      of time-window comparison. Fix before there's data.

---

## 9. Tests

- [ ] Window boundary — scan one second before `opens_at` and one after `closes_at`
- [ ] Replay — same card twice in one session → 409
- [ ] Revoked card → 401
- [ ] RBAC — student token on every admin route → 403, not 200 and not 401
- [ ] `authServices` — wrong password, unknown email, duplicate register

---

## Suggested order

```
finish RBAC (§2)  →  credentials/sessions split (§1)  →  attendance module (§3)
     →  zod wiring (§5)  →  scanner page (§7)  →  websocket (§6)
```

**Next session, concretely:** finish the `requireRole` guard and put `expiresIn` on the JWT — those two
go together and you're already mid-RBAC. Then do the table split, because `attendance.services.ts` can't
be written until `credentials` and `attendance_sessions` exist.
