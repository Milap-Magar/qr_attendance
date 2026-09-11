# RBAC — How It Works in This Project

**Written:** 2026-09-11 · Companion to `NEXT_STEPS.md` §2

---

## TL;DR — do I need `rbac.controller.ts`?

**No.** A controller answers HTTP requests for a *resource* (users, sessions, credentials).
RBAC isn't a resource that clients ask for. It's a **gate that sits in front of other routes** and
decides "let this request through, or stop it with a 403". Gates in Fastify are `preHandler`
hooks, so the RBAC module needs **middleware**, not a controller.

This project has no controllers anyway: each `*.routes.ts` file *is* the controller layer, because
it reads the request, calls the service, and sends the reply. Don't add a controller layer to one
module only.

The RBAC module should contain exactly this:

| File                      | Job                                                                  | Touches HTTP? | Touches DB? |
|---------------------------|----------------------------------------------------------------------|---------------|-------------|
| `rbac.constants.ts`       | **The policy.** Role list, permission list, role → permissions map   | no            | no          |
| `rbac.types.ts`           | `Role`, `Permission` types, **derived** from the constants           | no            | no          |
| `rbac.service.ts`         | Pure check functions (`roleHasPermission`) + optional fresh DB lookup | no            | optional    |
| `rbac.middleware.ts`      | `requirePermission(...)`, `requireRole(...)` → Fastify `preHandler`  | **yes**       | no          |
| ~~`rbac.routes.ts`~~      | Not needed. (You already deleted it, which was right.)               |               |             |
| ~~`rbac.controller.ts`~~  | Not needed.                                                          |               |             |

### When *would* RBAC get routes?

Only if you need one of these, and even then most of them belong somewhere else:

| Need                                              | Where it goes                                                       |
|---------------------------------------------------|---------------------------------------------------------------------|
| Admin changes a user's role                       | `users` module → `PATCH /api/users/:id/role`, guarded by a permission |
| Frontend needs to hide buttons the user can't use | `GET /api/users/me` returns `role` + `permissions`                   |
| Roles/permissions editable at runtime (DB tables) | *Then* RBAC gets its own routes (CRUD roles). Not needed for this app |

---

## 1. The mental model

```
   AUTHENTICATION                          AUTHORIZATION (RBAC)
   "Who are you?"                          "Are you allowed to do this?"
   ─────────────────                       ──────────────────────────────
   authMiddleware                          requirePermission("users:read")
   verifies the JWT                        checks role → permissions
   fails → 401 Unauthorized                fails → 403 Forbidden
```

RBAC is three hops:

```
   user ──has one──▶ role ──grants many──▶ permissions ◀──requires── route
   (DB row)          "teachers"            ["users:read", ...]         GET /api/users
```

**Routes ask for permissions, not roles.** A route should never contain `role === "admin"`.
It says "I need `users:read`", and the map in `rbac.constants.ts` decides which roles have that.
If you add a `staff` role later, you edit **one file** and don't touch any route.

---

## 2. The full request flow

### Step A — Login (happens once)

```
Client                        auth.routes.ts                  auth.services.ts            DB
  │  POST /api/login            │                                │                        │
  │  {email, password} ───────▶ │  authServices.login() ───────▶ │  SELECT user by email ▶│
  │                             │                                │ ◀── {id, role, hash} ──│
  │                             │ ◀── {id, role} (bcrypt ok) ────│                        │
  │                             │  jwt.sign({ userId, role })    │                        │
  │ ◀── { accessToken } ────────│                                │                        │
```

The **role is baked into the token**. The token now carries `{ userId, role, iat }`.

### Step B — Every protected request

```
Client: GET /api/users   Authorization: Bearer <token>
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ preHandler[0]  authMiddleware                                       │
│   request.jwtVerify()                                               │
│     ✗ missing / bad / expired token ──────────────▶ 401  STOP       │
│     ✓ sets request.user = { userId, role }                          │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ preHandler[1]  requirePermission("users:read")                      │
│   role = request.user.role                    // "teachers"         │
│   ROLE_PERMISSIONS["teachers"] includes "users:read"?               │
│     ✗ no ─────────────────────────────────────────▶ 403  STOP       │
│     ✓ yes → continue                                                │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ handler  (user.routes.ts)                                           │
│   userServices.getAllUsers() ──▶ DB                                 │
│   (optional) ownership check, e.g. "is this *your* profile?"        │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
 200 OK
```

Fastify runs `preHandler` hooks **in array order** and **stops the chain when a hook has sent a
reply** (`hookIterator` in `fastify/lib/hooks.js` checks `reply.sent`). That's why
`authMiddleware` must come first: `requirePermission` reads `request.user`, which only exists after
`jwtVerify()` has run.

---

## 3. Setting it up, step by step

### Step 1 — One source of truth for roles

Right now the role list is spelled in **four places**: `schema.ts:5`, `common.types.ts:3`,
`rbac.constants.ts`, `rbac.types.ts`. `common.types.ts` is still wrong (`"user"`, `"teacher"`).
Define it once and derive everything else from it:

```ts
// src/common/types/common.types.ts
export const roleEnum = ["system", "admin", "teachers", "users"] as const;
export type Role = (typeof roleEnum)[number];   // "system" | "admin" | "teachers" | "users"
```

```ts
// src/db/schema.ts
import { roleEnum as ROLE_VALUES } from "../common/types/common.types";
export const roleEnum = pgEnum("role", ROLE_VALUES);   // same list the DB uses
```

The `as const` is what makes this work. Without it, TypeScript widens the array to `string[]` and
`Role` becomes plain `string`, so typos compile again.

### Step 2 — Permissions and the policy map (`rbac.constants.ts`)

You already have `rolePermission`, which is the heart of RBAC. Derive the `Permission` type
the same way you did `Role`:

```ts
// rbac.constants.ts
import type { Role } from "../../common/types/common.types";

export const PERMISSIONS = [
  "users:read", "users:create", "users:update", "users:delete",
  "profile:read", "profile:update",
  "reports:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// THE POLICY. Answers "who can do what?" and nothing else.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  users:    ["profile:read", "profile:update"],
  teachers: ["profile:read", "users:read"],
  admin:    ["profile:read", "users:read", "users:update", "users:delete", "reports:read"],
  system:   ["profile:read", "users:read", "users:create", "users:update", "users:delete", "reports:read"],
};
```

`Record<Role, ...>` is a safety net. Add a role to `roleEnum` and forget it here, and TypeScript
gives you a compile error.

`rbac.types.ts` then just re-exports: `export type { Role } from "../../common/types/common.types";`
and `export type { Permission } from "./rbac.constants";`. Nothing gets typed by hand.

### Step 3 — Type `request.user` (stop casting)

Every route does `request.user as { userId: string }` today. Tell `@fastify/jwt` the shape once:

```ts
// src/common/types/fastify-jwt.d.ts
import "@fastify/jwt";
import type { Role } from "./common.types";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; role: Role };   // what jwt.sign() accepts
    user:    { userId: string; role: Role };   // what request.user is
  }
}
```

After this, `request.user.role` is typed as `Role` everywhere. **Expect one new compile error** in
`auth.routes.ts`: `jwt.sign({ userId: data.data?.id, ... })` passes `string | undefined`. That
error is useful. Narrow it (`if (data.status === 200 && data.data) { ... }`) so you can never sign a
token without a user id.

### Step 4 — The service: pure checks (`rbac.service.ts`)

Your current `hasPermission(userId, perm)` runs **a DB query on every check**. Split the pure
policy question from the DB lookup:

```ts
// rbac.service.ts
export const rbacServices = {
  // Pure. No DB, no HTTP. Easy to unit test.
  roleHasPermission(role: Role, permission: Permission) {
    return ROLE_PERMISSIONS[role].includes(permission);
  },

  // DB lookup: use ONLY where a stale role would matter (see §4 "stale roles").
  async getUserRole(userId: string) { /* your existing query, selecting only { role } */ },
};
```

`can()` was just an alias for `hasPermission()`, so you can delete it. `hasRole()` isn't needed if
routes ask for permissions.

> **Gotcha:** your methods call `this.getUserRole(...)`. That breaks if someone destructures
> (`const { hasRole } = rbacServices` → `this` is `undefined`). Call `rbacServices.getUserRole(...)`
> directly instead.

### Step 5 — The guard (`rbac.middleware.ts`), the file that makes it RBAC

A guard factory is a function that **takes the requirement and returns a `preHandler`**:

```ts
// src/modules/rbac/rbac.middleware.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission, Role } from "./rbac.types";
import { rbacServices } from "./rbac.service";

// Preferred: routes ask for permissions.
export const requirePermission = (...required: Permission[]) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user;   // set by authMiddleware
    const allowed = required.every((p) => rbacServices.roleHasPermission(role, p));
    if (!allowed) {
      return reply.status(403).send({ message: "Forbidden" });
    }
  };

// Escape hatch for the rare "only this role, full stop" case.
export const requireRole = (...roles: Role[]) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ message: "Forbidden" });
    }
  };
```

Two rules for hooks:
- **`return reply.status(...).send(...)`** in an async hook. Fastify's docs say to return
  `reply` whenever an async hook sends early. It also makes it obvious that the hook stops there.
- **403, not 401.** 401 means "I don't know who you are". 403 means "I know who you are, and no".
  The frontend handles them differently: 401 → go to login, 403 → show "not allowed".

### Step 6 — Wire it onto routes

```ts
// user.routes.ts
import { requirePermission } from "../rbac/rbac.middleware";

fastify.get("/", {
  preHandler: [authMiddleware, requirePermission("users:read")],   // order matters
}, async (request, reply) => { ... });
```

### Step 7 — Ownership: the part RBAC *can't* express

"Students can edit **their own** profile" is not a role question. The role map can only say
"users may `profile:update`", not "*this* profile". Check it in the handler:

```ts
// PATCH /api/users/:id
const { id } = request.params as { id: string };
const { userId, role } = request.user;

const isSelf  = id === userId;
const canAny  = rbacServices.roleHasPermission(role, "users:update");   // admin editing anyone
const canSelf = isSelf && rbacServices.roleHasPermission(role, "profile:update");

if (!canAny && !canSelf) return reply.status(403).send({ message: "Forbidden" });
```

Rule of thumb: **guard = "can this role do this kind of thing?"**, and
**handler = "can this user do it to this specific row?"**

### Step 8 — Verify with curl

```sh
# 1. no token → 401
curl -i localhost:3001/api/users

# 2. log in as a normal "users" account → 403
TOKEN=$(curl -s localhost:3001/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"student@x.com","password":"..."}' | jq -r .accessToken)
curl -i localhost:3001/api/users -H "authorization: Bearer $TOKEN"

# 3. log in as admin → 200
```

The three results must be **401 → 403 → 200**. I ran the guard above against a throwaway Fastify
app with `app.inject()`: no token → 401, `users` → 403, `teachers` → 200 on `users:read`;
`requireRole("admin","system")` gave `teachers` → 403 and `admin` → 200.

---

## 4. Things that will bite you

| Problem                      | What happens                                                                 | Fix                                                                              |
|------------------------------|------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| **Stale role in the JWT**    | You demote an admin, but their token still says `admin` until it expires     | Short `expiresIn` (15m–1h). On sensitive routes, re-read the role with `getUserRole()` |
| **JWTs never expire**        | `auth.routes.ts` signs with no `expiresIn`, so every token lasts forever     | `fastify.register(fastifyJwt, { secret, sign: { expiresIn: "1h" } })`            |
| **Role taken from the body** | `POST /api/users` accepts `role`, so any logged-in user can create an admin  | Guard with `users:create` (system only), and never let a user set their own role |
| **Guard before auth**        | `[requirePermission(...), authMiddleware]` → `request.user` is undefined → crash | `authMiddleware` always goes first                                           |
| **Missing `return`**         | Code after `send()` in the hook keeps running; Fastify can log "Reply was already sent" | `return reply.status(403).send(...)`                                   |
| **`role === "admin"` in routes** | Adding a role means hunting through every file                           | Ask for a permission; keep role names only in `rbac.constants.ts`                |

---

## 5. Route → permission map for this app

| Route                                | Guard                                          | Who gets in             |
|--------------------------------------|------------------------------------------------|-------------------------|
| `GET  /api/users/me`                 | `authMiddleware` only                          | anyone logged in        |
| `GET  /api/users`                    | `requirePermission("users:read")`              | teachers, admin, system |
| `GET  /api/users/:id`                | `users:read` **or** self (ownership check)     | staff, or yourself      |
| `POST /api/users`                    | `requirePermission("users:create")`            | system                  |
| `PATCH /api/users/:id`               | `users:update` **or** self + `profile:update`  | admin, system, yourself |
| `POST /api/credentials` (issue card) | `requirePermission("users:create")` or a new `credentials:issue` | admin |
| `POST /api/qr/verify` (scanner)      | new `attendance:scan`                          | teachers, admin         |
| `GET  /api/attendance/sessions/:id/logs` | `requirePermission("reports:read")`        | admin, system           |

When the attendance module lands, add `attendance:scan`, `attendance:open-session`, and
`credentials:issue` to `PERMISSIONS`, then give them to roles in `ROLE_PERMISSIONS`. No route code
changes for the roles.

---

## 6. Checklist

- [x] `common.types.ts`: `roleEnum` fixed to `["system","admin","teachers","users"] as const`
- [x] `schema.ts` builds `pgEnum` from that same array
- [x] `PERMISSIONS` `as const`, `Permission` type derived from it
- [x] Role → permissions map in `rbac.constants.ts` (named `rolePermission` in the code)
- [x] `rbac.types.ts` re-exports instead of retyping by hand
- [x] `src/common/types/fastify-jwt.d.ts` declares `payload` / `user`
- [x] Fix the `auth.routes.ts` sign error the typing reveals
- [x] `rbac.service.ts`: `roleHasPermission` (pure, role) + `userHasPermission` (DB, userId), no `this`
- [x] `rbac.middleware.ts`: `requirePermission` + `requireRole`, returning **403**
- [x] Apply guards to the routes in §5 (paths are now `/api/qr/credentials`, `/api/qr/scan`, `/api/attendance/...`, see API.md)
- [x] Ownership check on `GET/PATCH /api/users/:id`
- [x] `expiresIn` on the JWT (15m) + refresh tokens
- [x] `bun test` with `fastify.inject()`: 401 / 403 / 200 per route (`tests/`)
