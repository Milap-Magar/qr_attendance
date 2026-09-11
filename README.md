# QR Attendance — backend

Fastify + Drizzle (Postgres) + Bun. Students carry a QR card, a teacher's laptop scans it, the server records attendance.

- **API reference for the frontend:** [`API.md`](./API.md)
- **How RBAC works:** [`RBAC_FLOW.md`](./RBAC_FLOW.md)

## Setup (once)

```bash
bun install
cp .env.example .env            # then edit DATABASE_URL and JWT_SECRET
bun run db:migrate              # create the tables
bun run create-user --name "Admin" --email admin@school.com --password 'Admin@123' --role admin
```

The public `/register` endpoint only creates students. Use `create-user` to make your first admin/teacher.

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
| `bun run create-user --name .. --email .. --password .. [--role admin\|teachers\|users\|system]` | create any user from the terminal |

## Tests

Tests wipe every table, so they run against a **separate** database.
Create `.env.test` (gitignored) with the same URL but a database name containing `test`:

```bash
createdb qr_attendance_test
echo 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qr_attendance_test' > .env.test
bun run test
```

`bun test` loads `.env.test` automatically and refuses to run if the database name doesn't contain `test`.
Tests use `app.inject()` (fake HTTP requests, no port). See `tests/helpers.ts` → `loginAs(app, "admin")`.

## Folder layout

```
index.ts                  starts the server (DB check → migrations → listen)
src/app.ts                builds the Fastify app: CORS, JWT, error handler, routes
src/config.ts             every environment variable, in one place
src/db/schema.ts          all tables
src/common/               AppError, token helpers, shared types
src/modules/<name>/
   *.routes.ts            HTTP: validate input → call service → send reply
   *.services.ts          logic + database
   *.types.ts             zod schemas (input validation) + TS types
src/modules/rbac/         who can do what (rbac.constants.ts is the policy)
scripts/create-user.ts    CLI for creating users
tests/                    bun test
```
