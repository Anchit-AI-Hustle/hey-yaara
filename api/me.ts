// /api/me - the signed-in person's own profile.
//
//   GET                         -> { user }
//   PATCH  { name?, age?, gender?, email?, yaaraFemaleVoiceId?, yaarMaleVoiceId? }
//   POST   ?action=pin { pin, newPin, confirmPin }   change the PIN
//   DELETE { pin }              delete the account and everything in it

import { q } from "./_lib/db.js";
import { currentUser, guard, json, preflight, publicUser, readJson, type UserRow } from "./_lib/http.js";
import { choosePinError, hashPin, pinShapeError, verifyPin } from "./_lib/pin.js";

const COLS = "id, phone, name, age, gender, email, female_voice_id, male_voice_id, updated_at";
const GENDERS = new Set(["", "female", "male", "other"]);
const VOICE_RE = /^[A-Za-z0-9_-]{0,40}$/;

async function checkPin(userId: string, pin: unknown): Promise<boolean> {
  if (pinShapeError(pin)) return false;
  const { rows } = await q<{ pin_salt: string; pin_hash: string }>("select pin_salt, pin_hash from yaara_users where id = $1", [userId]);
  return Boolean(rows[0] && verifyPin(pin, rows[0].pin_salt, rows[0].pin_hash));
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  const me = await currentUser(req);
  if (!me) return json(req, { ok: false, signedIn: false, error: "Pehle sign in kijiye." }, 401);
  if (req.method === "GET") return json(req, { ok: true, user: publicUser(me) });

  const body = await readJson(req);
  if (!body) return json(req, { ok: false, error: "Send JSON." }, 415);

  if (req.method === "PATCH") {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if ("name" in body) {
      const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 60) return json(req, { ok: false, field: "name", error: "Naam 2 se 60 letters ka rakhiye." }, 400);
      put("name", name);
    }
    if ("age" in body) {
      const age = String(body.age ?? "").trim();
      if (age && !(/^\d{1,3}$/.test(age) && +age >= 1 && +age <= 120)) return json(req, { ok: false, field: "age", error: "Umar 1 se 120 ke beech likhiye." }, 400);
      put("age", age || null);
    }
    if ("gender" in body) {
      const g = String(body.gender ?? "").toLowerCase();
      if (!GENDERS.has(g)) return json(req, { ok: false, field: "gender", error: "Gender chuniye." }, 400);
      put("gender", g || null);
    }
    if ("email" in body) {
      const email = String(body.email ?? "").trim();
      if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json(req, { ok: false, field: "email", error: "Sahi email likhiye, ya khaali chhod dijiye." }, 400);
      put("email", email || null);
    }
    for (const [key, col] of [["yaaraFemaleVoiceId", "female_voice_id"], ["yaarMaleVoiceId", "male_voice_id"]] as const) {
      if (key in body) {
        const v = String(body[key] ?? "");
        if (!VOICE_RE.test(v)) return json(req, { ok: false, error: "Voice sahi nahi hai." }, 400);
        put(col, v || null);
      }
    }
    if (!sets.length) return json(req, { ok: true, user: publicUser(me) });
    vals.push(me.id);
    const { rows } = await q<UserRow>(
      `update yaara_users set ${sets.join(", ")}, updated_at = now() where id = $${vals.length} returning ${COLS}`, vals);
    return json(req, { ok: true, user: publicUser(rows[0]) });
  }

  const action = new URL(req.url).searchParams.get("action") || "";
  if (req.method === "POST" && action === "pin") {
    if (!(await checkPin(me.id, body.pin))) return json(req, { ok: false, field: "pin", error: "Abhi wala PIN galat hai." }, 401);
    const weak = choosePinError(body.newPin);
    if (weak) return json(req, { ok: false, field: "newPin", error: weak }, 400);
    if (String(body.confirmPin ?? "") !== String(body.newPin)) return json(req, { ok: false, field: "confirmPin", error: "Dono naye PIN alag hain." }, 400);
    const h = hashPin(String(body.newPin));
    await q("update yaara_users set pin_salt = $1, pin_hash = $2, pin_tries = 0, locked_until = null, updated_at = now() where id = $3", [h.salt, h.hash, me.id]);
    return json(req, { ok: true });
  }

  if (req.method === "DELETE") {
    if (!(await checkPin(me.id, body.pin))) return json(req, { ok: false, field: "pin", error: "PIN galat hai. Account delete nahi hua." }, 401);
    // Sessions, calls, recordings and the review go with it (on delete cascade).
    await q("delete from yaara_users where id = $1", [me.id]);
    return json(req, { ok: true, deleted: true }, 200, { "Set-Cookie": "yaara_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }
  return json(req, { ok: false, error: "Not allowed." }, 405);
}

export const handler = guard(handle);
export const GET = handler;
export const PATCH = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
