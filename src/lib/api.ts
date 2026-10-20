/**
 * api.ts - the one way the app talks to its server (/api/*).
 *
 * On the web the session is an httpOnly cookie the browser sends by itself. In
 * the native apps (Capacitor) the pages are local files, so calls go to the
 * hosted site and carry a Bearer token kept on the device.
 */

import { Capacitor } from "@capacitor/core";

const TOKEN_KEY = "yaara_native_token";
const isNative = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

export const API_BASE = isNative ? (import.meta.env.VITE_API_BASE || "https://hey-yaara.vercel.app") : "";

export class ApiError extends Error {
  status: number;
  field?: string;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error || "Kuch gadbad ho gayi. Dobara try kijiye."));
    this.status = status;
    this.field = typeof body.field === "string" ? body.field : undefined;
    this.body = body;
  }
}

const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const saveNativeToken = (token: string | null) => {
  if (!isNative) return;
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage off */ }
};
export const isNativeApp = () => isNative;

/** fetch + the session, for the few calls that are not JSON (audio). */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = isNative ? readToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(API_BASE + path, { ...init, headers, credentials: isNative ? "omit" : "same-origin" });
}

/** JSON in, JSON out. Throws ApiError with the server's own message. */
export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || (opts.body === undefined ? "GET" : "POST") };
  if (opts.body !== undefined) {
    const body = isNative && path.startsWith("/api/auth") ? { ...(opts.body as object), client: "native" } : opts.body;
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new ApiError(0, { error: "Internet nahi mil raha. Connection check karke dobara try kijiye." });
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) throw new ApiError(res.status, data);
  return data as T;
}
