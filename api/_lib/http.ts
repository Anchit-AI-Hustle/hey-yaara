// Small helpers shared by the api/ functions: JSON replies, the signed-in user,
// and CORS for the native apps (which call the hosted API with a Bearer token).

import { q } from "./db.js";
import { tokenFrom, tokenHash } from "./pin.js";

// The Capacitor apps load from these origins. They send a Bearer token, never
// a cookie, so no credentials are allowed cross-origin.
const NATIVE_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost", "ionic://localhost"]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  if (!NATIVE_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(req),
      ...extra,
    },
  });
}

export const preflight = (req: Request) => new Response(null, { status: 204, headers: corsHeaders(req) });

/**
 * JSON bodies only: a plain cross-site form cannot send this content type, so
 * no other site can act for a signed-in visitor.
 */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!/application\/json/i.test(req.headers.get("content-type") || "")) return null;
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface UserRow {
  id: string;
  phone: string;
  name: string;
  age: string | null;
  gender: string | null;
  email: string | null;
  female_voice_id: string | null;
  male_voice_id: string | null;
  updated_at: Date;
}

/** The signed-in user, from the session cookie or Bearer token, or null. */
export async function currentUser(req: Request): Promise<UserRow | null> {
  const token = tokenFrom(req.headers);
  if (!token) return null;
  const { rows } = await q<UserRow>(
    `select u.id, u.phone, u.name, u.age, u.gender, u.email, u.female_voice_id, u.male_voice_id, u.updated_at
       from yaara_sessions s join yaara_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash(token)],
  );
  return rows[0] || null;
}

/** What the app sees of an account. Never the PIN hash. */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    mobile: u.phone.slice(3),
    phone: u.phone,
    age: u.age || "",
    gender: u.gender || "",
    email: u.email || "",
    yaaraFemaleVoiceId: u.female_voice_id || "",
    yaarMaleVoiceId: u.male_voice_id || "",
    updatedAt: new Date(u.updated_at).toISOString(),
  };
}

/** Wraps a handler: database not set up -> 503; anything unexpected -> 500. */
export function guard(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err?.code === "unconfigured") {
        return json(req, { ok: false, error: "Sign-in abhi band hai. Thodi der baad try kijiye." }, 503);
      }
      console.error("[api] failed:", err?.message);
      return json(req, { ok: false, error: "Kuch gadbad ho gayi. Dobara try kijiye." }, 500);
    }
  };
}
