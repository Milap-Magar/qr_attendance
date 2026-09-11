# Remaining Tasks: QR frontend integration

Status as of 2026-09-11. This replaces §6 and §7 of `NEXT_STEPS.md`, which are out of date.

## Where things stand

The backend API is **fully wired into the frontend**. Every endpoint in `API.md` has a page:

| Endpoint | Frontend |
|---|---|
| `POST /api/auth/login`, `/register`, `/refresh`, `/logout` | `routes/login.tsx`, `register.tsx`, `logout.tsx`, auto-refresh in `lib/api.ts` |
| `GET /api/users/me` | `lib/auth.ts` → `requireUser()`, sidebar shows links by `permissions` |
| `GET/POST /api/users` | `routes/dashboard/users.tsx` (list, role filter, "Add user" for `system`) |
| `POST/GET /api/qr/credentials`, `PATCH .../revoke` | `users.tsx` row menu → `components/qr-card-dialog.tsx` (print card) |
| `POST /api/qr/scan` | `routes/dashboard/scan.tsx` (laptop camera + typed/USB input) |
| `POST/GET /api/attendance/sessions`, `PATCH .../close` | `routes/dashboard/sessions.tsx` |
| `GET /api/attendance/sessions/:id`, `.../records` | `routes/dashboard/session-detail.tsx` |
| `GET /api/attendance/me` | `routes/dashboard/my-attendance.tsx`, student overview in `home.tsx` |

Checked: `bun test` (35/35 pass), `cd frontend && bun run typecheck` (clean), `bun run build` (ok).

**Done (Task 2a + 2b):** a student can now show their QR on their phone (*My QR* page,
`POST /api/qr/credentials/me`). Still to do: 2c, trying it on a real phone.

---

## Task 0: Commit what exists (5 min)

The whole frontend is uncommitted (`git status` shows ~37 new files). Commit it before changing anything,
so every task below is a small diff you can review or revert.

```bash
git add frontend README.md tsconfig.json
git commit -m "added: frontend (react router v7 + shadcn) wired to the api"
```

## Task 1: Smoke-test every role by hand (20 min)

```bash
bun run dev                                   # terminal 1: API on :3001
cd frontend && cp .env.example .env && bun run dev   # terminal 2: UI on :5173
bun run create-user --name "Admin" --email admin@school.com --password 'Admin@123' --role admin
```

- [ ] **Student**: `/register` → lands on Overview → "My attendance" is empty
- [ ] **Admin**: log in → Users → row menu → *Issue card* → QR dialog → *Print* shows only the card
- [ ] **Admin**: Sessions → *New session* (15 min) → *Scan* → hold the printed/on-screen QR to the camera
      → green "Checked in" → scan again → amber "already checked in"
- [ ] Revoke the card → scan it → red "revoked"
- [ ] Session detail shows the student in the list, count went up
- [ ] **Student** again: "My attendance" shows the check-in
- [ ] Set `ACCESS_TOKEN_TTL=10s` in `.env`, restart API, wait 15s, click around. You should **not** get
      logged out (the refresh in `lib/api.ts` kicks in). Put it back to `15m` after.

Write down anything that breaks. Fix those before new features.

---

## Task 2: Student shows their QR on their phone (the main missing feature)

> ✅ **2a and 2b are implemented** (`bun test` 40/40). The token lives in `localStorage` under `phoneQr`
> as `{ userId, token }`, so another student logging in on the same phone never sees it. Logout clears it.
> Only **2c** (try it on a real phone) is left.

**Idea:** a student taps "Use this phone as my card" once. The server issues a `device` credential
(the `method` enum already has `'device'`), returns the token once, and the phone keeps it in
`localStorage`. The *My QR* page draws it. The laptop scanner doesn't change at all, because
`/api/qr/scan` already looks up any credential by hash.

### 2a. Backend

1. **Permission**: `src/modules/rbac/rbac.constants.ts`
   ```ts
   export const PERMISSIONS = [ ..., "qr:self" ] as const;   // show my own QR on my phone
   // add "qr:self" to the `users` role (students). Staff don't need it.
   ```

2. **Service**: `src/modules/qr/qr.services.ts`. ⚠️ `issueCredential` currently revokes **every**
   active credential of the user. If you reuse it as-is, setting up a phone kills the printed card.
   Scope the revoke to the same method:
   ```ts
   async issueCredential(userId: string, method: "card" | "device" = "card") {
     ...
     await tx.update(credentials)
       .set({ revokedAt: new Date() })
       .where(and(eq(credentials.userId, userId), eq(credentials.method, method), isNull(credentials.revokedAt)));

     const [created] = await tx.insert(credentials)
       .values({ userId, tokenHash: hashToken(token), method })
       .returning(credentialColumns);
     ...
   }
   ```
   Result: one active card **and** one active phone per student. A new phone replaces the old phone only.

3. **Route**: `src/modules/qr/qr.routes.ts`
   ```ts
   // POST /api/qr/credentials/me — a student turns THIS phone into their card
   fastify.post("/credentials/me", {
     preHandler: [authMiddleware, requirePermission("qr:self")],
   }, async (request, reply) => {
     const credential = await qrServices.issueCredential(request.user.userId, "device");
     return reply.status(201).send(credential);
   });
   ```

4. **Test** (`tests/qr-attendance.test.ts`):
   - [ ] student `POST /credentials/me` → 201 with `token`, `method: "device"`
   - [ ] scanning that token → 201 checked in
   - [ ] issuing a phone token does **not** revoke the printed card (both scan fine)
   - [ ] a second `POST /credentials/me` → the first phone token now gets 403 `QR_REVOKED`
   - [ ] a teacher calling it → 403

5. Add the endpoint to the QR table in `API.md`.

### 2b. Frontend

1. `app/lib/types.ts`: add `| "qr:self"` to `Permission`.

2. `app/routes.ts`: inside the dashboard `layout(...)`:
   ```ts
   route("my-qr", "routes/dashboard/my-qr.tsx"),
   ```

3. `app/components/app-sidebar.tsx`: add to `NAV` (import `QrCodeIcon` from lucide-react):
   ```ts
   { title: "My QR", to: "/my-qr", icon: QrCodeIcon, show: (me) => me.permissions.includes("qr:self") },
   ```

4. New file `app/routes/dashboard/my-qr.tsx`. It follows the same loader/action pattern as the other pages:
   ```tsx
   import { useFetcher } from "react-router";
   import { QRCodeSVG } from "qrcode.react";
   import type { Route } from "./+types/my-qr";
   import { api, toActionError } from "~/lib/api";
   import { requireUser } from "~/lib/auth";
   import type { Credential } from "~/lib/types";

   export const handle = { title: "My QR" };
   const KEY = "qrToken"; // this phone's token, never sent anywhere except inside the QR

   export async function clientLoader() {
     const me = await requireUser("qr:self");
     return { me, token: localStorage.getItem(KEY) };
   }

   export async function clientAction() {
     try {
       const card = await api<Credential & { token: string }>("/api/qr/credentials/me", { method: "POST" });
       localStorage.setItem(KEY, card.token);
       return { ok: true as const };
     } catch (error) {
       return toActionError(error);
     }
   }

   export default function MyQr({ loaderData }: Route.ComponentProps) {
     const { me, token } = loaderData;
     const fetcher = useFetcher<typeof clientAction>();
     // no token yet → one button. token → big QR (white background, scanners need contrast)
     // ...render <QRCodeSVG value={token} size={260} marginSize={2} /> inside a bg-white box,
     //    me.name under it, and a small "Set up again" button that re-submits the fetcher
     //    (warn: it replaces the QR on your previous phone).
   }
   ```
   Nice extras, all optional:
   - keep the screen on while the QR is showing: `navigator.wakeLock?.request("screen")` in a `useEffect`
   - show "Turn your brightness up" hint text
   - if a scan returns `QR_REVOKED` for a phone token, the student just taps "Set up again"

5. `app/routes/dashboard/home.tsx` → `StudentOverview`: add a big "Show my QR" button linking to `/my-qr`
   (that's the first thing a student wants on their phone).

6. `app/routes/logout.tsx`: decide whether logout also runs `localStorage.removeItem("qrToken")`.
   On a **shared** phone it should. On a personal phone it's annoying. Recommended: remove it, since logging
   back in and tapping "Set up again" takes 2 seconds.

7. `app/routes/dashboard/users.tsx`: `activeCards` maps `userId → credential`. With phones, a student
   can have two active credentials. Filter to printed cards only:
   ```ts
   credentials.filter((c) => !c.revokedAt && c.method === "card")
   ```

### 2c. Run it on a real phone (same Wi-Fi)

The phone only **shows** a QR and never uses the camera, so it does **not** need HTTPS. The laptop scanner
runs on `localhost`, where the camera is allowed.

```bash
ip -4 addr | grep inet            # find the laptop's LAN IP, e.g. 192.168.1.20
```
- [ ] Backend already listens on `0.0.0.0` (`index.ts`). Leave `CORS_ORIGIN` unset in dev, or add
      `http://192.168.1.20:5173` to it.
- [ ] `frontend/.env`: `VITE_API_URL=http://192.168.1.20:3001`. **Not** `localhost`: on the phone,
      `localhost` means the phone itself.
- [ ] `cd frontend && bun run dev -- --host` → open `http://192.168.1.20:5173` on the phone
- [ ] If the phone can't connect: open the ports in the firewall (`5173`, `3001`)
- [ ] Laptop: `http://localhost:5173/scan`. Phone: log in as student → My QR → hold it up

> **Known weakness (fix later, not now):** a static token on a phone can be screenshotted and sent
> to a friend. The printed card has the same problem. The cheap fix is Task 7 (the operator sees a photo).
> The strong fix is a rotating QR that changes every 30s (HMAC of a per-device secret + the current time window).
> Only do that if buddy check-ins actually happen.

---

## Task 3: Live updates while scanning (1 hour)

Pages load data once. If the scanner runs on one laptop and the session page is on a projector or
another tab, the list and count don't move, and a session that hits `closesAt` still shows "open".
Polling is plenty for a classroom. Skip WebSockets for now.

New file `app/hooks/use-polling.ts`:
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
Use it:
- [ ] `session-detail.tsx`: `usePolling(5000, session.status !== "closed")`
- [ ] `scan.tsx`: `usePolling(15000)` so the session list and "open until" stay correct
- [ ] `sessions.tsx`: `usePolling(30000)` so statuses flip from open → closed on their own

(`getMe()` is cached in `lib/auth.ts`, so polling doesn't re-fetch `/me` each time.)

---

## Task 4: Decide who sees the check-in list (5 min)

Right now **teachers can run the scanner but can't see who checked in**. `reports:read` is admin-only,
so session detail shows "Admins only" to a teacher. If teachers should see it, add one line in
`src/modules/rbac/rbac.constants.ts`:
```ts
teachers: [ ..., "reports:read" ],
```
No frontend change is needed, since the page already checks the permission. Update the roles table in `API.md`.

## Task 5: Profile page (1 hour)

The backend has `PATCH /api/users/:id` (`{ name?, gender? }`, allowed on yourself). The frontend has no page for it.
- [ ] `route("profile", "routes/dashboard/profile.tsx")`, linked from the user menu in `app-sidebar.tsx`
- [ ] `clientAction`: `api(\`/api/users/${me.id}\`, { method: "PATCH", body: {...} })`, then **`resetMe()`**.
      Without it, the sidebar keeps showing the old name, because `getMe()` is cached.

## Task 6: Small session improvements (1–2 hours)

- [ ] **Schedule for later**: the "New session" dialog only does *now + duration*. Add an optional
      `<Input type="datetime-local" name="opensAt">` and send `opensAt: new Date(value).toISOString()`.
      The backend already accepts it, and the status becomes `"upcoming"`.
- [ ] **CSV export** on session detail (admins), done client-side from `records` you already have:
      ```ts
      const cell = (v: string) => `"${v.replaceAll('"', '""')}"`;
      const csv = ["name,email,checked_in_at", ...records.map((r) => [r.student.name, r.student.email, r.scannedAt].map(cell).join(","))].join("\n");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `${session.title}.csv` });
      a.click();
      ```

## Task 7: Student photo on scan (optional, anti-cheating)

The one real defense against "my friend scanned my card" is that the operator sees a face.
- [ ] `users.photo_url` column (`bun run db:generate && bun run db:migrate`)
- [ ] return it in `scan()`'s `student` object (`qr.services.ts`)
- [ ] `scan.tsx` → `ResultPanel`: show the photo big in the green result
- [ ] upload: simplest is an admin-pasted URL. Real uploads are a separate project.

## Task 8: Backend hardening before real users

- [ ] **Rate limit** `POST /api/auth/login` and `POST /api/qr/scan`: `bun add @fastify/rate-limit`,
      register with `global: false`, add `config: { rateLimit: { max: 10, timeWindow: "1 minute" } }` on those two routes.
- [ ] **`is_active`** defaults to `false` and nothing checks it, so every user is "inactive" and it
      doesn't matter. Either drop the column, or default it to `true` and reject login when `false`
      (then add a deactivate toggle on the Users page).

## Task 9: Production build

- [ ] `VITE_API_URL` is baked in **at build time**: `VITE_API_URL=https://api.yourschool.com bun run build`
- [ ] `frontend/build/client` is plain static files. Any static host works, but it must fall back to
      `index.html` for unknown paths (SPA mode), or refreshing `/sessions/123` gives a 404.
- [ ] Backend: set `CORS_ORIGIN` to the real frontend URL. Use a long random `JWT_SECRET`.
- [ ] HTTPS everywhere. The laptop scanner's camera **requires** it once it's not on `localhost`.

## Housekeeping

- [ ] `NEXT_STEPS.md` §4–§9 are mostly done or out of date (e.g. it says "Bun HTML imports, no Vite",
      but the frontend uses React Router + Vite now). Tick what's done or delete it so it doesn't mislead you.

---

## Suggested order

```
Task 0 commit → Task 1 smoke test → Task 2 phone QR (the actual product) → Task 3 polling
   → Task 4 decision → Tasks 5–6 polish → Task 7–8 before real users → Task 9 deploy
```
