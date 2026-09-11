import { redirect } from "react-router";
import { api, tokens } from "./api";
import type { Me, Permission } from "./types";

// React Router runs parent and child loaders IN PARALLEL, so several loaders may
// ask "who am I?" at once. They all share this one request.
let mePromise: Promise<Me> | null = null;

export function getMe() {
  mePromise ??= api<Me>("/api/users/me").catch((error) => {
    mePromise = null; // don't cache failures
    throw error;
  });
  return mePromise;
}

// call after login / logout so the next getMe() asks the server again
export function resetMe() {
  mePromise = null;
}

// Use at the top of every protected clientLoader.
//   const me = await requireUser();                    → any logged-in user
//   const me = await requireUser("sessions:manage");   → also needs that permission
export async function requireUser(permission?: Permission) {
  if (!tokens.access && !tokens.refresh) throw redirect("/login");
  const me = await getMe();
  if (permission && !me.permissions.includes(permission)) throw redirect("/dashboard");
  return me;
}

export const can = (me: Me, permission: Permission) => me.permissions.includes(permission);
