# Remaining Tasks

Status as of 2026-09-12, after the **class roster** rewrite. This replaces the previous version of this
file, and most of `NEXT_STEPS.md`, which now describes a product that no longer exists.

## What changed, in one paragraph

Students used to be login accounts that signed themselves up with a school join code and could show a QR
on their phone. They are now **roster entries that never log in**: a school creates *classes*
(grade + section + academic year) and adds *students* to them, one at a time or by CSV import, and each
student gets **one permanent QR card** the moment they are added. Attendance is counted **per day** — the
first scan into any open session marks a student present for that day, and any teacher can scan any
student. Class, section and roll number are for grouping and sorting reports, not for gating scans.

Only staff (`admin`, `teachers`, `system`) have accounts.

## Where things stand

Backend: **94 tests pass**, `bun run typecheck` clean, the whole flow verified over real HTTP
(see §5 of `API.md`). Frontend: `bun run typecheck` clean, `bun run build` succeeds, every `/api/...`
path it calls exists on the server.

| Endpoint | Frontend |
|---|---|
| `POST /api/auth/login`, `/register-school`, `/refresh`, `/logout` | `routes/login.tsx`, `signup.tsx`, `logout.tsx`, auto-refresh in `lib/api.ts` |
| `GET /api/users/me` | `lib/auth.ts` → `requireUser()`, sidebar shows links by `permissions` |
| `GET/POST /api/users` | `routes/dashboard/users.tsx` — now the **Staff** page (admin/teachers only) |
| `GET/POST/PATCH/DELETE /api/classes` | `routes/dashboard/classes.tsx` |
| `GET /api/classes/:id/students`, `POST /api/classes/:id/cards` | `routes/dashboard/class-detail.tsx` + `components/card-sheet.tsx` |
| `POST /api/students`, `/import` | `class-detail.tsx` + `components/import-students-dialog.tsx` + `lib/csv.ts` |
| `GET /api/students`, `GET/PATCH/DELETE /api/students/:id` | `routes/dashboard/students.tsx`, `student-detail.tsx` |
| `POST /api/qr/credentials`, `PATCH .../revoke` | `student-detail.tsx` (re-issue / revoke one card) |
| `POST /api/qr/scan` | `routes/dashboard/scan.tsx` |
| `POST/GET /api/attendance/sessions`, `PATCH .../close` | `routes/dashboard/sessions.tsx`, `session-detail.tsx` |
| `GET /api/attendance/register` | `routes/dashboard/register.tsx` — **the daily register** |
| `GET /api/attendance/summary` | `routes/dashboard/home.tsx` |
| `GET /api/attendance/students/:id` | `student-detail.tsx` |
| `GET/PATCH /api/organizations/current` | `routes/dashboard/school.tsx` (incl. the timezone) |

---

## Task 1: Click through it yourself (30 min) — **do this first**

Nobody has driven the new UI in a browser yet. Everything below type-checks, builds and is covered by
API tests, but that is not the same as using it.

```bash
bun run dev                                   # terminal 1: API on :3001
cd frontend && cp .env.example .env && bun run dev   # terminal 2: UI on :5173
```

Sign up a school at `/signup`, then:

- [ ] **School** → set the **timezone** to yours. Do this *before* any real scan — it decides which
      calendar day a scan lands on. Wrong timezone = attendance on the wrong date.
- [ ] **Classes** → New class (e.g. Grade 10 / A / 2026)
- [ ] Open the class → **Add student** → the QR appears **once**. Print it, or keep the tab open.
- [ ] **Import CSV** with a file like below → preview → import → **Print cards** → check the A4 sheet
      previews with one QR per student and nothing else on the page
      ```csv
      rollNo,name,gender
      1,Aarav Shah,male
      2,Asha Karki,female
      ```
- [ ] Re-upload the same file → every row should be reported as skipped, nothing duplicated
- [ ] **Sessions** → New session → **Scan** → hold up a printed card → green, with name + roll + class
- [ ] Scan the same card again → **amber** "already marked present at HH:MM", not a red error
- [ ] Open a *second* session and scan that same card → still amber (that's the per-day rule working)
- [ ] **Register** → pick the class → the scanned student is present, everyone else absent, in roll order
- [ ] Export the register CSV and open it in Excel — names should not be mangled
- [ ] **Student detail** → re-issue a card → the old one now scans as red "revoked"
- [ ] Mark a student as left → they drop off the register and their card scans as "no longer enrolled"

Write down anything that breaks. Fix that before anything below.

## Task 2: Two decisions left over from the rewrite

- [ ] **Teachers can now read reports** (`reports:read`), because any teacher scans any student and
      needs the class list. If the office should be the only one who sees it, remove that one line from
      `teachers` in `src/modules/rbac/rbac.constants.ts`. No frontend change needed.
- [ ] **The join code is now dead.** It only ever existed for student self-signup. The column, the API
      and the card on the School page are still there. Either delete them, or repurpose the code for
      **staff invites** (a teacher signs up with it instead of an admin typing their password).

## Task 3: Legacy rows from before the rewrite

Migration `0004` **truncates `credentials` and `attendance_records`** — their old rows pointed at `users`
and there is no student row to map them onto. Old cards no longer work; reprint from each class.

Student *accounts* in `users` (role `users`) were left alone, on purpose: deleting rows in a migration is
not something to do quietly. They're hidden from the Staff page and can't reach anything, but they still
hold their email addresses.

- [ ] Decide: delete them (`DELETE FROM users WHERE role = 'users'`) or leave them. If you delete them,
      the `users` role and its `rolePermission` entry can go too.

## Task 4: Live updates while scanning (1 hour)

Pages load once. With the scanner on one laptop and the register on a projector, the numbers don't move.
Polling is plenty for a school; skip WebSockets.

New file `frontend/app/hooks/use-polling.ts`:
```ts
import { useEffect } from "react";
import { useRevalidator } from "react-router";

// re-run the page's clientLoader every `ms` while the tab is visible
export function usePolling(ms: number, enabled = true) {
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => document.visibilityState === "visible" && revalidate(), ms);
    return () => clearInterval(id);
  }, [ms, enabled, revalidate]);
}
```
- [ ] `register.tsx`: `usePolling(5000)` when the date is today — this is the projector page
- [ ] `session-detail.tsx`: `usePolling(5000, session.status !== "closed")`
- [ ] `sessions.tsx`: `usePolling(30000)` so statuses flip open → closed on their own

## Task 5: Roll a class over to the next academic year (2 hours)

The schema supports it (`academicYear` is part of a class's identity) but there's no UI, so next July
somebody re-types 400 students.

- [ ] `POST /api/classes/:id/promote` → `{ academicYear, grade }`, creates the target class and moves
      every active student across, keeping roll numbers **and their existing cards** (cards belong to the
      student, not the class, so nothing needs reprinting — worth saying so in the UI)
- [ ] Leavers: a "graduating" class where students get `isActive: false` instead of moving

## Task 6: Profile page (1 hour)

`PATCH /api/users/:id` exists (`{ name?, gender? }`, allowed on yourself); no page uses it.
- [ ] `route("profile", "routes/dashboard/profile.tsx")`, linked from the user menu in `app-sidebar.tsx`
- [ ] In `clientAction`, call **`resetMe()`** after saving, or the sidebar keeps the old name (`getMe()` caches)

## Task 7: Session improvements (1–2 hours)

- [ ] **Schedule for later**: the New session dialog only does *now + duration*. Add an optional
      `<Input type="datetime-local" name="opensAt">`; the backend already accepts it and the status
      becomes `"upcoming"`.
- [ ] **Absent-student follow-up**: from the register, a "copy absent names" button beats reading them off a screen.

## Task 8: Student photo on scan (optional, anti-cheating)

The one real defence against "my friend scanned my card" is the operator seeing a face.
- [ ] `students.photo_url` column (`bun run db:generate && bun run db:migrate`)
- [ ] return it in `scan()`'s `student` object (`src/modules/qr/qr.services.ts`)
- [ ] `scan.tsx` → show it big in the green result
- [ ] Upload: simplest is an admin-pasted URL. Real uploads are a separate project.

## Task 9: Backend hardening before real users

- [ ] **Rate limit** `POST /api/auth/login` and `POST /api/qr/scan`: `bun add @fastify/rate-limit`,
      register with `global: false`, then `config: { rateLimit: { max: 10, timeWindow: "1 minute" } }`
      on those two routes.
- [ ] **`users.is_active`** defaults to `false` and nothing reads it, so every staff account is
      "inactive" and it doesn't matter. Either drop the column or default it to `true` and reject login
      when `false`. (`students.isActive` is a different column and *is* used — don't confuse them.)
- [ ] **Card tokens are printed once.** If a school loses a batch before printing, their only option is
      reprinting the class. Consider a short grace window where a just-issued batch can be re-fetched,
      or accept it and make the print step impossible to skip.

## Task 10: Deploy to Render (free tier)

Two Render services + an **external** Postgres. The code is deploy-ready: `index.ts` binds `0.0.0.0`,
`config.port` reads `PORT`, and migrations run on boot.

| Piece | Render service | Free? |
|---|---|---|
| Fastify API | **Web Service** | ✅ free instance |
| `frontend/` (SPA, `ssr: false`) | **Static Site** | ✅ free, unlimited |
| Postgres | ⚠️ **use Neon or Supabase** | Render's free DB is deleted 30 days after creation |

### 10a. Database first (you need the URL)
- [ ] Free Postgres on **Neon** (or Supabase); copy the **pooled** connection string
- [ ] Must be TLS — postgres-js handles `?sslmode=require` in the URL as-is
- [ ] Migrations run automatically on first boot (`index.ts`), so no manual `db:migrate`
- [ ] Then: `bun run create-user --school <join code> --name "Admin" --email ... --role admin`

### 10b. API — **Web Service**
- [ ] `.bun-version` at the repo root containing `latest`
- [ ] Build: `bun install` · Start: `bun index.ts` · Health check path: `/health`
- [ ] Env: `DATABASE_URL`, `JWT_SECRET` (`openssl rand -base64 48`), `CORS_ORIGIN` = the static site URL.
      Leave `PORT` unset; Render sets it.

### 10c. Frontend — **Static Site**
- [ ] Root directory `frontend` · Build `bun install && bun run build` · Publish `frontend/build/client`
- [ ] **Rewrite rule** `/*` → `/index.html` (action: Rewrite), or refreshing `/classes/123` 404s
- [ ] `VITE_API_URL=https://<api>.onrender.com` — baked in **at build time**, so changing it needs a
      fresh deploy, not a restart

### 10d. Cold starts (read before a real class uses this)
Free web services spin down after 15 min idle and take ~1 min to wake — a minute of students waiting at
the door. 750 instance-hours/month vs ~730 for always-on, so it fits:
- [ ] Point UptimeRobot (free) at `GET /health` every 10 minutes
- [ ] After a night idle, hit it cold and time it

$7/mo Starter removes the spin-down entirely. That's the first upgrade to buy.

### 10e. Verify in production
- [ ] HTTPS on both — the scanner's camera **requires** it anywhere but `localhost`
- [ ] Add a class → import students → print cards → scan one → it lands on the register
- [ ] Refresh a deep link like `/classes/<id>` → no 404 (proves the rewrite rule)
- [ ] A wrong-origin request is rejected (proves `CORS_ORIGIN`)

## Task 11: Mobile app

The web app already covers both jobs: students just **hold a printed card** (no app needed at all now
that the phone-QR feature is gone), and a teacher **scans**. So a native app only buys the scanner
reliable camera permissions and a home-screen icon.

**Recommended: Capacitor**, wrapping the existing SPA — every screen exists and the API is already
remote, so this is a shell, not a rewrite.

- [ ] `cd frontend && bun add @capacitor/core @capacitor/cli && bunx cap init`; `webDir: "build/client"`
- [ ] `bunx cap add android` (no paid account needed to test on a device)
- [ ] `VITE_API_URL` must be the **Render URL**, not a LAN IP
- [ ] Add `capacitor://localhost` / `https://localhost` to the API's `CORS_ORIGIN`
- [ ] `@capacitor/barcode-scanner` if the webview camera disappoints
- [ ] Test that token refresh still works after the app has been backgrounded for hours — `lib/api.ts`
      auto-refresh has only ever run in a live tab
- [ ] Airplane mode → a readable message, not a blank screen

Do Task 10 **before** this: the build bakes in the API URL, so wrapping a localhost app means redoing it.

## Housekeeping

- [ ] `NEXT_STEPS.md` describes the pre-rewrite product (student sign-up, phone QR, per-session
      attendance). Delete it or rewrite it — right now it will actively mislead you.

---

## Suggested order

```
Task 1 click through  →  Task 2 decisions  →  Task 3 legacy rows
  →  Task 4 polling  →  Task 5 year rollover  →  Tasks 6–7 polish
  →  Task 9 hardening  →  Task 10 deploy  →  Task 11 mobile
```

Task 8 (student photo) is independent — slot it in if buddy check-ins actually become a problem.
