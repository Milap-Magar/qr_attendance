# Hajir — backend

**Hajir** (हाजिर, "present!") is multi-school QR attendance, run as a SaaS. A school or college signs up, students
join it with a join code and carry a QR (printed card or phone), a teacher's laptop scans it, the server records attendance.
Every school's data is kept apart: each query is scoped to the caller's organization.

Fastify + Drizzle (Postgres) + Bun.

- **API reference for the frontend:** [`API.md`](./API.md)
- **How RBAC works:** [`RBAC_FLOW.md`](./RBAC_FLOW.md)
- **Frontend (React Router v7 + shadcn/ui):** [`frontend/`](./frontend/README.md). Run `bun run dev` here, then `cd frontend && bun run dev`

## Setup (once)

```bash
bun install
cp .env.example .env            # then edit DATABASE_URL and JWT_SECRET
bun run db:migrate              # create the tables
```

Then open the frontend and click **Start free** (`/signup`) to create a school. You become its admin, and the
**School** page shows the join code your students sign up with.

Optional, the platform operator (you, above all schools; sees every school on the **Schools** page):

```bash
bun run create-user --role system --name "Platform Owner" --email you@hajir.app --password 'Admin@123'
```

> **Upgrading from the single-school version:** migration `0003_organizations` moves all existing users and
> sessions into one school called "My School" (rename it on the School page). Existing `system` accounts
> become platform operators with no school. Log in with an `admin` account to manage the school.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | start the API on http://localhost:3001, restarts when you save a file |
| `bun run start` | start the API (no auto-restart) |
| `bun run test` | run all tests (uses the **test** database, see below) |
| `bun run typecheck` | TypeScript check, no output = no errors |
| `bun run db:generate` | after editing `src/db/schema.ts` → writes a new SQL migration into `drizzle/` |
| `bun run db:migrate` | apply migrations (the server also does this on startup) |
| `bun run db:studio` | browse the database in the browser |
| `bun run create-user --name .. --email .. --password .. --role system` | create a platform operator |
| `bun run create-user --school <JOINCODE> --name .. --email .. --password .. [--role admin\|teachers\|users]` | add someone to a school from the terminal |

## Logging

On startup the server prints every API route. Then each request logs one line when it finishes
(5xx = `ERROR`, 4xx = `WARN`, rest = `INFO`; `/health` only at `debug`):

```
[10:42:01] INFO: POST /api/qr/scan 200 8.3ms {"reqId":"req-7","userId":"…","role":"teachers","ip":"127.0.0.1"}
```

Pretty colored output by default; set `NODE_ENV=production` for JSON lines. `LOG_LEVEL` = `debug`, `info` (default),
`warn`, `error`, `silent`. Passwords, tokens and the `Authorization` header are redacted. Setup: `src/common/logger.ts`.

## Tests

Tests wipe every table, so they run against a **separate** database.
Create `.env.test` (gitignored) with the same URL but a database name containing `test`:

```bash
createdb qr_attendance_test
echo 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qr_attendance_test' > .env.test
bun run test
```

`bun test` loads `.env.test` automatically and refuses to run if the database name doesn't contain `test`.
Tests use `app.inject()` (fake HTTP requests, no port). See `tests/helpers.ts` → `loginAs(app, "admin")`
(everyone lands in one default test school; pass `{ orgId }` for another). `tests/organizations.test.ts` checks
that two schools can't see or touch each other's data.

## Folder layout

```
index.ts                  starts the server (DB check → migrations → listen)
src/app.ts                builds the Fastify app: CORS, JWT, error handler, routes
src/config.ts             every environment variable, in one place
src/db/schema.ts          all tables
src/common/               AppError, logger, token helpers, shared types
src/modules/<name>/
   *.routes.ts            HTTP: validate input → call service → send reply
   *.services.ts          logic + database
   *.types.ts             zod schemas (input validation) + TS types
src/modules/rbac/         who can do what (rbac.constants.ts is the policy)
src/modules/organizations/ schools (tenants): join codes, school settings, platform list
scripts/create-user.ts    CLI for creating users
tests/                    bun test
```
