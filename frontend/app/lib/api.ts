// Every request to the backend goes through `api()`.
// It adds the access token, and when the token has expired (401) it refreshes
// it ONCE and retries, so pages never have to think about tokens.
import { redirect } from "react-router";
import type { AuthResponse } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ---------- token storage ----------
export const tokens = {
  get access() {
    return localStorage.getItem("accessToken");
  },
  get refresh() {
    return localStorage.getItem("refreshToken");
  },
  save({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
  },
  clear() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  },
};

// ---------- errors ----------
// the backend always answers errors with { message, code, errors? }
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

// ---------- refresh ----------
// if 5 requests get a 401 at the same time, they all wait for this ONE refresh
let refreshing: Promise<boolean> | null = null;

function refreshTokens() {
  refreshing ??= (async () => {
    if (!tokens.refresh) return false;
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    });
    if (!res.ok) return false;
    tokens.save((await res.json()) as AuthResponse);
    return true;
  })().finally(() => (refreshing = null));
  return refreshing;
}

// ---------- the request helper ----------
type Options = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown };

export async function api<T>(path: string, { method = "GET", body }: Options = {}): Promise<T> {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(tokens.access && { authorization: `Bearer ${tokens.access}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();

  // access token expired → refresh and retry (never for the auth endpoints themselves)
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    if (await refreshTokens()) {
      res = await send();
    } else {
      // refresh token is dead too → back to the login page.
      // (thrown inside a clientLoader/clientAction, React Router performs the redirect)
      tokens.clear();
      throw redirect("/login");
    }
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.message ?? "Something went wrong", data.code, data.errors);
  }
  return data as T;
}

// For clientActions: turn an API error into data the form can show,
// but let everything else (e.g. a redirect) keep bubbling up.
export type ActionError = { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function toActionError(error: unknown): ActionError {
  if (error instanceof ApiError) {
    return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
  }
  throw error;
}
