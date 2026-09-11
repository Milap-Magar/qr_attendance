# Hajir — frontend

React 19 + React Router v7 (framework mode, SPA) + shadcn/ui + Tailwind v4. Bun is the package manager.

## Run it

```bash
# 1. backend first (from the repo root): bun run dev   → http://localhost:3001
# 2. then:
cd frontend
bun install
cp .env.example .env      # VITE_API_URL=http://localhost:3001
bun run dev               # → http://localhost:5173
```

Open http://localhost:5173, click **Start free** to create a school (you become its admin), then share the
join code from the **School** page. Students join at `/register?code=<joinCode>`.

The product name, tagline and logo live in `app/lib/brand.ts` and `app/components/logo.tsx` (+ `public/favicon.svg`).

| Command | What it does |
|---|---|
| `bun run dev` | dev server with hot reload |
| `bun run build` | production build → `build/client` (static files, host anywhere) |
| `bun run preview` | serve the production build locally |
| `bun run typecheck` | generate route types + TypeScript check |
| `bunx --bun shadcn@latest add <name>` | add another shadcn component into `app/components/ui` |

> **Camera:** browsers only allow the camera on `https://` or `localhost`. To scan from a phone or another
> laptop on your network you need HTTPS. The code box under the camera always works, also with USB scanners.

## How it's built (React Router v7 style)

```
app/
  routes.ts                   ← the route list (URL → file)
  root.tsx                    ← <html>, toaster, error page
  routes/
    landing.tsx               ← public marketing page at /
    login.tsx                 ← public pages (Form + clientAction)
    signup.tsx                ← a school signs up (creates the school + its admin)
    register.tsx              ← a student joins a school with its join code (?code=)
    logout.tsx                ← action only, no page
    dashboard/
      layout.tsx              ← sidebar + top bar; clientLoader redirects to /login if logged out
      home.tsx                ← /dashboard overview (staff stats / student history)
      school.tsx              ← school settings, join code, join QR for the projector (admins)
      schools.tsx             ← every school on the platform (system)
      scan.tsx                ← camera scanner
      sessions.tsx            ← list + "New session"
      session-detail.tsx      ← who checked in
      users.tsx               ← users, issue / revoke QR cards
      my-attendance.tsx       ← a student's own check-ins
  components/                 ← app components (sidebar, QR card dialog, ...)
  components/ui/              ← shadcn components (generated, edit freely)
  lib/
    api.ts                    ← fetch wrapper: adds the token, refreshes it on 401, throws ApiError
    auth.ts                   ← requireUser(permission?) for loaders, can(me, permission)
    types.ts                  ← backend response types
```

Every page follows the same pattern:

```tsx
// 1. READ data before the page renders
export async function clientLoader() {
  await requireUser("sessions:manage");            // not allowed → redirect
  return { sessions: await api("/api/attendance/sessions") };
}

// 2. WRITE data when a <Form> / fetcher submits
export async function clientAction({ request }) {
  const form = await request.formData();
  try {
    await api("/api/attendance/sessions", { method: "POST", body: { ... } });
    return { ok: true };
  } catch (error) {
    return toActionError(error);                   // { ok: false, error, fieldErrors }
  }
}

// 3. RENDER. After an action, React Router re-runs the loaders, so the page updates itself
export default function Page({ loaderData, actionData }) { ... }
```

What each role sees comes from `permissions` in `GET /api/users/me`. Nav links and buttons check them,
and so does every loader (`requireUser("...")`). The backend enforces the same rules again.
