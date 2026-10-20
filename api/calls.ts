// /api/calls - the signed-in person's own calls with Yaara. Nobody else's.
//
//   GET                          -> { calls }  newest first, without the audio
//   GET    ?id=<id>&audio=1      -> the recording (audio bytes)
//   POST   ?action=message { callId, role, text }   one line, saved live during a call
//   POST   ?action=save    { id, startTime, endTime, duration, status, transcript? }
//                                  without a transcript, the live lines are used
//   PUT    ?id=<id>  body: audio  the recording, up to 4 MB
//   DELETE ?id=<id>

import { q } from "./_lib/db.js";
import { corsHeaders, currentUser, guard, json, preflight, readJson } from "./_lib/http.js";

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const ROLES = new Set(["user", "yaara"]);

type Line = { id: string; role: "user" | "yaara"; text: string; timestamp: string; status: "final" };

function cleanTranscript(raw: unknown): Line[] {
  if (!Array.isArray(raw)) return [];
  const out: Line[] = [];
  for (const [i, l] of raw.slice(0, 500).entries()) {
    if (!l || typeof l !== "object") continue;
    const line = l as Record<string, unknown>;
    const role = String(line.role);
    const text = String(line.text ?? "").trim().slice(0, 2000);
    if (!ROLES.has(role) || !text) continue;
    const ts = new Date(String(line.timestamp ?? ""));
    out.push({
      id: String(line.id ?? i).slice(0, 64),
      role: role as Line["role"],
      text,
      timestamp: isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
      status: "final",
    });
  }
  return out;
}

const toCall = (r: Record<string, unknown>) => ({
  id: r.id,
  startTime: new Date(r.start_time as string).toISOString(),
  endTime: r.end_time ? new Date(r.end_time as string).toISOString() : null,
  duration: r.duration,
  status: r.status,
  transcript: r.transcript || [],
  hasAudio: r.has_audio,
  updatedAt: new Date(r.updated_at as string).toISOString(),
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  const me = await currentUser(req);
  if (!me) return json(req, { ok: false, signedIn: false, error: "Pehle sign in kijiye." }, 401);
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (id && !ID_RE.test(id)) return json(req, { ok: false, error: "Call id sahi nahi hai." }, 400);

  if (req.method === "GET" && id && url.searchParams.get("audio")) {
    const { rows } = await q<{ mime: string; bytes: Buffer }>(
      "select mime, bytes from yaara_call_audio where call_id = $1 and user_id = $2", [id, me.id]);
    if (!rows[0]) return json(req, { ok: false, error: "Is call ki recording nahi hai." }, 404);
    return new Response(new Uint8Array(rows[0].bytes), {
      status: 200,
      headers: {
        "Content-Type": rows[0].mime,
        "Cache-Control": "private, no-store",
        "Content-Length": String(rows[0].bytes.length),
        "X-Content-Type-Options": "nosniff",
        ...corsHeaders(req),
      },
    });
  }
  if (req.method === "GET") {
    const { rows } = await q(
      `select id, start_time, end_time, duration, status, transcript, has_audio, updated_at
         from yaara_calls where user_id = $1 order by start_time desc limit 200`, [me.id]);
    return json(req, { ok: true, calls: rows.map(toCall) });
  }

  if (req.method === "PUT") {
    if (!id) return json(req, { ok: false, error: "Call id chahiye." }, 400);
    const mime = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^audio\/[a-z0-9.+-]+$/.test(mime)) return json(req, { ok: false, error: "Sirf audio file." }, 415);
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_AUDIO_BYTES) return json(req, { ok: false, tooLarge: true, error: "Recording 4 MB se badi hai, save nahi hui." }, 413);
    const bytes = Buffer.from(await req.arrayBuffer());
    if (!bytes.length) return json(req, { ok: false, error: "Recording khaali hai." }, 400);
    if (bytes.length > MAX_AUDIO_BYTES) return json(req, { ok: false, tooLarge: true, error: "Recording 4 MB se badi hai, save nahi hui." }, 413);
    const owned = await q("select 1 from yaara_calls where id = $1 and user_id = $2", [id, me.id]);
    if (!owned.rows[0]) return json(req, { ok: false, error: "Yeh call nahi mili." }, 404);
    await q(
      `insert into yaara_call_audio (call_id, user_id, mime, bytes) values ($1, $2, $3, $4)
       on conflict (call_id) do update set mime = excluded.mime, bytes = excluded.bytes, created_at = now()
       where yaara_call_audio.user_id = excluded.user_id`, [id, me.id, mime, bytes]);
    await q("update yaara_calls set has_audio = true, updated_at = now() where id = $1 and user_id = $2", [id, me.id]);
    return json(req, { ok: true, size: bytes.length });
  }

  if (req.method === "DELETE") {
    if (!id) return json(req, { ok: false, error: "Call id chahiye." }, 400);
    const { rowCount } = await q("delete from yaara_calls where id = $1 and user_id = $2", [id, me.id]);
    await q("delete from yaara_messages where call_id = $1 and user_id = $2", [id, me.id]);
    return json(req, { ok: true, deleted: rowCount === 1 });
  }

  if (req.method !== "POST") return json(req, { ok: false, error: "Not allowed." }, 405);
  const body = await readJson(req);
  if (!body) return json(req, { ok: false, error: "Send JSON." }, 415);
  const action = url.searchParams.get("action") || "";

  if (action === "message") {
    const callId = String(body.callId ?? "");
    const role = String(body.role ?? "");
    const text = String(body.text ?? "").trim().slice(0, 2000);
    if (!ID_RE.test(callId) || !ROLES.has(role) || !text) return json(req, { ok: false, error: "Message sahi nahi hai." }, 400);
    await q("insert into yaara_messages (call_id, user_id, role, text) values ($1, $2, $3, $4)", [callId, me.id, role, text]);
    return json(req, { ok: true });
  }

  if (action === "save") {
    const callId = String(body.id ?? "");
    if (!ID_RE.test(callId)) return json(req, { ok: false, error: "Call id sahi nahi hai." }, 400);
    const start = new Date(String(body.startTime ?? ""));
    if (isNaN(start.getTime())) return json(req, { ok: false, error: "Call ka time sahi nahi hai." }, 400);
    const endRaw = body.endTime ? new Date(String(body.endTime)) : null;
    const end = endRaw && !isNaN(endRaw.getTime()) ? endRaw : null;
    const duration = Math.max(0, Math.min(24 * 3600, Math.round(Number(body.duration) || 0)));
    const status = ["completed", "failed", "processing"].includes(String(body.status)) ? String(body.status) : "completed";
    let transcript = cleanTranscript(body.transcript);
    if (!transcript.length) {
      // Built from the lines saved live during the call.
      const msgs = await q<{ id: string; role: string; text: string; created_at: Date }>(
        "select id, role, text, created_at from yaara_messages where call_id = $1 and user_id = $2 order by created_at, id",
        [callId, me.id]);
      transcript = cleanTranscript(msgs.rows.map((m) => ({ id: String(m.id), role: m.role, text: m.text, timestamp: m.created_at })));
    }
    // Upsert, but never onto a call id that belongs to someone else.
    const { rows } = await q(
      `insert into yaara_calls (id, user_id, start_time, end_time, duration, status, transcript)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       on conflict (id) do update set end_time = excluded.end_time, duration = excluded.duration,
         status = excluded.status, transcript = excluded.transcript, updated_at = now()
       where yaara_calls.user_id = excluded.user_id
       returning id, start_time, end_time, duration, status, transcript, has_audio, updated_at`,
      [callId, me.id, start, end, duration, status, JSON.stringify(transcript)]);
    if (!rows[0]) return json(req, { ok: false, error: "Yeh call id kisi aur ki hai." }, 409);
    return json(req, { ok: true, call: toCall(rows[0]) });
  }
  return json(req, { ok: false, error: "Unknown action." }, 404);
}

export const handler = guard(handle);
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
