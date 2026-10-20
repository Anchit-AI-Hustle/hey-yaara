// /api/reviews - rate and review Hey Yaara. One review per person; it can be edited.
//
//   GET   -> { summary: { count, average }, mine }   mine only when signed in
//   POST  { rating: 1-5, text? }                       saves (or updates) mine

import { q } from "./_lib/db.js";
import { currentUser, guard, json, preflight, readJson } from "./_lib/http.js";

const MAX_TEXT = 500;

async function summary() {
  const { rows } = await q<{ count: string; average: string | null }>(
    "select count(*)::text as count, round(avg(rating)::numeric, 1)::text as average from yaara_reviews");
  return { count: Number(rows[0]?.count || 0), average: rows[0]?.average ? Number(rows[0].average) : null };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  const me = await currentUser(req);

  if (req.method === "GET") {
    let mine = null;
    if (me) {
      const { rows } = await q<{ rating: number; text: string; updated_at: Date }>(
        "select rating, text, updated_at from yaara_reviews where user_id = $1", [me.id]);
      if (rows[0]) mine = { rating: rows[0].rating, text: rows[0].text, updatedAt: new Date(rows[0].updated_at).toISOString() };
    }
    return json(req, { ok: true, summary: await summary(), mine });
  }

  if (req.method !== "POST") return json(req, { ok: false, error: "Not allowed." }, 405);
  if (!me) return json(req, { ok: false, signedIn: false, error: "Review dene ke liye pehle sign in kijiye." }, 401);
  const body = await readJson(req);
  if (!body) return json(req, { ok: false, error: "Send JSON." }, 415);
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(req, { ok: false, field: "rating", error: "1 se 5 stars chuniye." }, 400);
  const text = String(body.text ?? "").trim().replace(/\s+\n/g, "\n");
  if (text.length > MAX_TEXT) return json(req, { ok: false, field: "text", error: `Review ${MAX_TEXT} letters se chhota rakhiye.` }, 400);
  await q(
    `insert into yaara_reviews (user_id, rating, text) values ($1, $2, $3)
     on conflict (user_id) do update set rating = excluded.rating, text = excluded.text, updated_at = now()`,
    [me.id, rating, text]);
  return json(req, { ok: true, mine: { rating, text }, summary: await summary() });
}

export const handler = guard(handle);
export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
