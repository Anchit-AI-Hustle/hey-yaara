// /api/auth - sign up and sign in with a mobile number and a 4-digit PIN.
//
//   POST ?action=signup   { name, mobile, pin, confirmPin, client? }
//   POST ?action=signin   { mobile, pin, client? }   5 wrong tries lock it for 15 minutes
//   POST ?action=signout  ends this session on the server
//   GET  ?action=session  -> { signedIn, user }
//   GET  ?action=status   -> { configured }; with &check=1 also { reachable }
//
// Web: an httpOnly cookie. Native apps send client: "native", get { token } and
// send it back as "Authorization: Bearer <token>".

import { configured, ping, q } from "./_lib/db.js";
import { currentUser, guard, json, preflight, publicUser, readJson, type UserRow } from "./_lib/http.js";
import {
  LOCK_MINUTES, MAX_TRIES, SESSION_DAYS, choosePinError, clearCookie, hashPin, lockMessage,
  newToken, normPhone, pinShapeError, sessionCookie, tokenFrom, tokenHash, verifyPin, wrongPinMessage,
} from "./_lib/pin.js";

const USER_COLS = "id, phone, name, age, gender, email, female_voice_id, male_voice_id, updated_at";

async function startSession(req: Request, user: UserRow, body: Record<string, unknown>, status = 200, extra = {}) {
  const token = newToken();
  const maxAge = SESSION_DAYS * 86400;
  const expires = new Date(Date.now() + maxAge * 1000);
  await q("insert into yaara_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [tokenHash(token), user.id, expires]);
  // Keep the table small: drop sessions that have run out.
  await q("delete from yaara_sessions where expires_at < now()");
  const out: Record<string, unknown> = { ok: true, user: publicUser(user), ...extra };
  if (body.client === "native") {
    out.token = token;
    out.expiresAt = expires.toISOString();
    return json(req, out, status);
  }
  return json(req, out, status, { "Set-Cookie": sessionCookie(token, maxAge) });
}

async function signup(req: Request, body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return json(req, { ok: false, field: "name", error: "Apna naam likhiye." }, 400);
  if (name.length > 60) return json(req, { ok: false, field: "name", error: "Naam 60 letters se chhota rakhiye." }, 400);
  const phone = normPhone(body.mobile);
  if (!phone) return json(req, { ok: false, field: "mobile", error: "10-digit mobile number likhiye (jaise 98765 43210)." }, 400);
  const weak = choosePinError(body.pin);
  if (weak) return json(req, { ok: false, field: "pin", error: weak }, 400);
  if (String(body.confirmPin ?? "") !== String(body.pin)) {
    return json(req, { ok: false, field: "confirmPin", error: "Dono PIN alag hain. Wahi 4 numbers dobara likhiye." }, 400);
  }
  const h = hashPin(String(body.pin));
  // Insert-if-absent: two sign-ups racing for one number get exactly one account,
  // and an existing account is never overwritten from here.
  const { rows } = await q<UserRow>(
    `insert into yaara_users (phone, name, pin_salt, pin_hash) values ($1, $2, $3, $4)
     on conflict (phone) do nothing returning ${USER_COLS}`,
    [phone, name, h.salt, h.hash],
  );
  if (!rows[0]) {
    return json(req, { ok: false, exists: true, field: "mobile", error: "Is number ka account pehle se hai. Sign in kijiye." }, 409);
  }
  return startSession(req, rows[0], body, 201, { created: true });
}

async function signin(req: Request, body: Record<string, unknown>) {
  const phone = normPhone(body.mobile);
  if (!phone) return json(req, { ok: false, field: "mobile", error: "10-digit mobile number likhiye (jaise 98765 43210)." }, 400);
  const shape = pinShapeError(body.pin);
  if (shape) return json(req, { ok: false, field: "pin", error: shape }, 400);

  const found = await q<UserRow & { pin_salt: string; pin_hash: string; locked_until: Date | null }>(
    `select ${USER_COLS}, pin_salt, pin_hash, locked_until from yaara_users where phone = $1`, [phone]);
  const acct = found.rows[0];
  if (!acct) {
    return json(req, { ok: false, notFound: true, field: "mobile", error: "Is number ka koi account nahi hai. Naya account banaiye." }, 404);
  }
  const locked = (until: Date | string) => json(req, { ok: false, locked: true, error: lockMessage(until) }, 429);
  if (acct.locked_until && new Date(acct.locked_until).getTime() > Date.now()) return locked(acct.locked_until);

  // Claimed in the database BEFORE the PIN is checked, and only while the
  // number is not locked, so a burst of parallel guesses cannot slip past.
  const claim = await q<{ pin_tries: number }>(
    `update yaara_users set pin_tries = pin_tries + 1
      where id = $1 and (locked_until is null or locked_until <= now()) returning pin_tries`, [acct.id]);
  const lockNow = async () => {
    await q(`update yaara_users set pin_tries = 0, locked_until = now() + make_interval(mins => $2::int)
              where id = $1 and (locked_until is null or locked_until <= now())`, [acct.id, LOCK_MINUTES]);
    const r = await q<{ locked_until: Date }>("select locked_until from yaara_users where id = $1", [acct.id]);
    return locked(r.rows[0]?.locked_until || new Date(Date.now() + LOCK_MINUTES * 60000));
  };
  if (!claim.rows[0]) {
    const r = await q<{ locked_until: Date }>("select locked_until from yaara_users where id = $1", [acct.id]);
    return locked(r.rows[0]?.locked_until || new Date(Date.now() + LOCK_MINUTES * 60000));
  }
  const tries = claim.rows[0].pin_tries;
  if (tries > MAX_TRIES) return lockNow();
  if (!verifyPin(body.pin, acct.pin_salt, acct.pin_hash)) {
    if (tries >= MAX_TRIES) return lockNow();
    const left = MAX_TRIES - tries;
    return json(req, { ok: false, wrongPin: true, left, field: "pin", error: wrongPinMessage(left) }, 401);
  }
  await q("update yaara_users set pin_tries = 0, locked_until = null where id = $1", [acct.id]);
  return startSession(req, acct, body);
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  if (req.method === "GET" && action === "status") {
    const out: Record<string, unknown> = { ok: true, configured: configured() };
    if (out.configured && url.searchParams.get("check")) {
      try { out.reachable = await ping(); } catch (e) { console.error("[auth] db check failed:", (e as Error).message); out.reachable = false; }
    }
    return json(req, out);
  }
  if (!configured()) return json(req, { ok: false, error: "Sign-in abhi band hai. Thodi der baad try kijiye." }, 503);

  if (req.method === "GET" && action === "session") {
    const user = await currentUser(req);
    if (!user) {
      const headers: Record<string, string> = req.headers.get("cookie")?.includes("yaara_session=") ? { "Set-Cookie": clearCookie() } : {};
      return json(req, { ok: true, signedIn: false }, 200, headers);
    }
    return json(req, { ok: true, signedIn: true, user: publicUser(user) });
  }
  if (req.method !== "POST") return json(req, { ok: false, error: "Not allowed." }, 405);
  const body = await readJson(req);
  if (!body) return json(req, { ok: false, error: "Send JSON." }, 415);

  if (action === "signup") return signup(req, body);
  if (action === "signin") return signin(req, body);
  if (action === "signout") {
    const token = tokenFrom(req.headers);
    if (token) await q("delete from yaara_sessions where token_hash = $1", [tokenHash(token)]);
    return json(req, { ok: true }, 200, { "Set-Cookie": clearCookie() });
  }
  return json(req, { ok: false, error: "Unknown action." }, 404);
}

export const handler = guard(handle);
export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
