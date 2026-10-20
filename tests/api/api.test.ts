// End-to-end tests of the api/ handlers on a real Postgres.
//   TEST_DATABASE_URL=postgres://... npm run test:api

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, freshMobile, TEST_DB } from "./helpers";

const PIN = "4071";

describe.skipIf(!TEST_DB)("api on Postgres", () => {
  let auth: (r: Request) => Promise<Response>;
  let me: (r: Request) => Promise<Response>;
  let calls: (r: Request) => Promise<Response>;
  let reviews: (r: Request) => Promise<Response>;
  let raw: pg.Pool;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    raw = new pg.Pool({ connectionString: TEST_DB, max: 2 });
    await raw.query(`drop table if exists yaara_reviews, yaara_call_audio, yaara_messages, yaara_calls, yaara_sessions, yaara_users cascade`);
    auth = (await import("../../api/auth")).handler;
    me = (await import("../../api/me")).handler;
    calls = (await import("../../api/calls")).handler;
    reviews = (await import("../../api/reviews")).handler;
    closeDb = (await import("../../api/_lib/db")).closeForTests;
  });
  afterAll(async () => {
    await closeDb?.();
    await raw?.end();
  });

  async function signedUp(name = "Asha Devi") {
    const mobile = freshMobile();
    const r = await call(auth, "POST", "/api/auth?action=signup", { body: { name, mobile, pin: PIN, confirmPin: PIN } });
    expect(r.status).toBe(201);
    return { mobile, cookie: r.cookie as string, user: r.body.user };
  }

  describe("status", () => {
    it("reports the database as configured and reachable", async () => {
      const r = await call(auth, "GET", "/api/auth?action=status&check=1");
      expect(r.body).toEqual({ ok: true, configured: true, reachable: true });
      expect(r.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("sign up", () => {
    it("creates the account, signs in with an httpOnly cookie, and stores only a PIN hash", async () => {
      const mobile = freshMobile();
      const r = await call(auth, "POST", "/api/auth?action=signup", { body: { name: "  Ramesh   Kumar ", mobile: "+91 " + mobile, pin: PIN, confirmPin: PIN } });
      expect(r.status).toBe(201);
      expect(r.body.user).toMatchObject({ name: "Ramesh Kumar", mobile, phone: "+91" + mobile });
      expect(r.body.user.pin_hash).toBeUndefined();
      const setCookie = r.headers.get("set-cookie") || "";
      expect(setCookie).toMatch(/^yaara_session=[A-Za-z0-9_-]{40,};/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/Secure/);
      expect(setCookie).toMatch(/SameSite=Lax/);
      expect(r.body.token).toBeUndefined();
      const row = (await raw.query("select pin_hash, pin_salt from yaara_users where phone = $1", ["+91" + mobile])).rows[0];
      expect(row.pin_hash).not.toContain(PIN);
      expect(row.pin_hash).toMatch(/^[0-9a-f]{64}$/);
      const tokens = (await raw.query("select token_hash from yaara_sessions s join yaara_users u on u.id = s.user_id where u.phone = $1", ["+91" + mobile])).rows;
      expect(tokens).toHaveLength(1);
      expect(tokens[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("refuses a number that already has an account", async () => {
      const { mobile } = await signedUp();
      const r = await call(auth, "POST", "/api/auth?action=signup", { body: { name: "Someone Else", mobile, pin: "5826", confirmPin: "5826" } });
      expect(r.status).toBe(409);
      expect(r.body.exists).toBe(true);
    });

    it("checks the name, the number, an easy PIN and a mismatched confirmation", async () => {
      const mobile = freshMobile();
      const bad = async (body: object) => call(auth, "POST", "/api/auth?action=signup", { body: { name: "Asha", mobile, pin: PIN, confirmPin: PIN, ...body } });
      expect((await bad({ name: "" })).body.field).toBe("name");
      expect((await bad({ mobile: "12345" })).body.field).toBe("mobile");
      expect((await bad({ mobile: "5123456789" })).body.field).toBe("mobile");
      for (const weak of ["1234", "0000", "9876", "1111", "2580"]) {
        const r = await bad({ pin: weak, confirmPin: weak });
        expect(r.status).toBe(400);
        expect(r.body.field).toBe("pin");
      }
      expect((await bad({ pin: "12a4", confirmPin: "12a4" })).body.field).toBe("pin");
      expect((await bad({ pin: "40712", confirmPin: "40712" })).body.field).toBe("pin");
      expect((await bad({ confirmPin: "4072" })).body.field).toBe("confirmPin");
      const none = await raw.query("select 1 from yaara_users where phone = $1", ["+91" + mobile]);
      expect(none.rowCount).toBe(0);
    });

    it("two sign-ups racing for one number make exactly one account", async () => {
      const mobile = freshMobile();
      const rs = await Promise.all(["4071", "5826"].map((p) =>
        call(auth, "POST", "/api/auth?action=signup", { body: { name: "Race", mobile, pin: p, confirmPin: p } })));
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    });
  });

  describe("sign in", () => {
    it("the right PIN signs in; the session finds the user; sign out ends it", async () => {
      const { mobile } = await signedUp("Kamla");
      const r = await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: PIN } });
      expect(r.status).toBe(200);
      expect(r.body.user.name).toBe("Kamla");
      const s = await call(auth, "GET", "/api/auth?action=session", { cookie: r.cookie });
      expect(s.body).toMatchObject({ signedIn: true, user: { mobile, name: "Kamla" } });
      await call(auth, "POST", "/api/auth?action=signout", { body: {}, cookie: r.cookie });
      const after = await call(auth, "GET", "/api/auth?action=session", { cookie: r.cookie });
      expect(after.body.signedIn).toBe(false);
    });

    it("a number with no account says so", async () => {
      const r = await call(auth, "POST", "/api/auth?action=signin", { body: { mobile: freshMobile(), pin: PIN } });
      expect(r.status).toBe(404);
      expect(r.body.notFound).toBe(true);
    });

    it("wrong PINs count down 4, 3, 2, 1, then the number locks for 15 minutes, even for the right PIN", async () => {
      const { mobile } = await signedUp();
      for (const left of [4, 3, 2, 1]) {
        const r = await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: "9999" } });
        expect(r.status).toBe(401);
        expect(r.body.left).toBe(left);
      }
      const fifth = await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: "9999" } });
      expect(fifth.status).toBe(429);
      const right = await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: PIN } });
      expect(right.status).toBe(429);
      expect(right.body.error).toMatch(/1[45] minute/);
    });

    it("a burst of 20 parallel guesses cannot get past the lock", async () => {
      const { mobile } = await signedUp();
      const guesses = Array.from({ length: 20 }, (_, i) => String(5000 + i * 7).padStart(4, "0"));
      const rs = await Promise.all(guesses.map((pin) => call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin } })));
      expect(rs.filter((r) => r.status === 401).length).toBeLessThanOrEqual(4);
      expect(rs.every((r) => r.status === 401 || r.status === 429)).toBe(true);
      expect((await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: PIN } })).status).toBe(429);
    });

    it("a right PIN resets the count", async () => {
      const { mobile } = await signedUp();
      for (let i = 0; i < 3; i++) await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: "9999" } });
      expect((await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: PIN } })).status).toBe(200);
      expect((await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: "9999" } })).body.left).toBe(4);
    });

    it("native apps get a Bearer token that works", async () => {
      const { mobile } = await signedUp();
      const r = await call(auth, "POST", "/api/auth?action=signin", { body: { mobile, pin: PIN, client: "native" } });
      expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      expect(r.headers.get("set-cookie")).toBeNull();
      const s = await call(auth, "GET", "/api/auth?action=session", { headers: { authorization: "Bearer " + r.body.token } });
      expect(s.body.signedIn).toBe(true);
    });

    it("an expired session is refused", async () => {
      const { mobile, cookie } = await signedUp();
      await raw.query(`update yaara_sessions set expires_at = now() - interval '1 minute'
        where user_id = (select id from yaara_users where phone = $1)`, ["+91" + mobile]);
      expect((await call(auth, "GET", "/api/auth?action=session", { cookie })).body.signedIn).toBe(false);
    });

    it("a plain form post is refused (JSON only)", async () => {
      const r = await call(auth, "POST", "/api/auth?action=signin", { raw: "mobile=1&pin=2", headers: { "content-type": "application/x-www-form-urlencoded" } });
      expect(r.status).toBe(415);
    });

    it("lets the native app origins call it, and nobody else cross-origin", async () => {
      const ok = await call(auth, "GET", "/api/auth?action=status", { headers: { origin: "capacitor://localhost" } });
      expect(ok.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
      const no = await call(auth, "GET", "/api/auth?action=status", { headers: { origin: "https://evil.example" } });
      expect(no.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  describe("profile", () => {
    it("needs a session", async () => {
      expect((await call(me, "GET", "/api/me")).status).toBe(401);
    });

    it("reads and updates only the signed-in person's profile", async () => {
      const a = await signedUp("Asha");
      const b = await signedUp("Bimla");
      const r = await call(me, "PATCH", "/api/me", { cookie: a.cookie, body: { name: "Asha Rani", age: "72", gender: "female", email: "asha@example.com", yaaraFemaleVoiceId: "21m00Tcm4TlvDq8ikWAM" } });
      expect(r.status).toBe(200);
      expect(r.body.user).toMatchObject({ name: "Asha Rani", age: "72", gender: "female", email: "asha@example.com", yaaraFemaleVoiceId: "21m00Tcm4TlvDq8ikWAM" });
      expect((await call(me, "GET", "/api/me", { cookie: b.cookie })).body.user.name).toBe("Bimla");
    });

    it("refuses bad values", async () => {
      const a = await signedUp();
      expect((await call(me, "PATCH", "/api/me", { cookie: a.cookie, body: { age: "200" } })).body.field).toBe("age");
      expect((await call(me, "PATCH", "/api/me", { cookie: a.cookie, body: { email: "nope" } })).body.field).toBe("email");
      expect((await call(me, "PATCH", "/api/me", { cookie: a.cookie, body: { gender: "x" } })).body.field).toBe("gender");
      expect((await call(me, "PATCH", "/api/me", { cookie: a.cookie, body: { name: "A" } })).body.field).toBe("name");
    });

    it("changes the PIN only with the current one", async () => {
      const a = await signedUp();
      expect((await call(me, "POST", "/api/me?action=pin", { cookie: a.cookie, body: { pin: "9999", newPin: "5826", confirmPin: "5826" } })).status).toBe(401);
      expect((await call(me, "POST", "/api/me?action=pin", { cookie: a.cookie, body: { pin: PIN, newPin: "1234", confirmPin: "1234" } })).body.field).toBe("newPin");
      expect((await call(me, "POST", "/api/me?action=pin", { cookie: a.cookie, body: { pin: PIN, newPin: "5826", confirmPin: "5826" } })).status).toBe(200);
      expect((await call(auth, "POST", "/api/auth?action=signin", { body: { mobile: a.mobile, pin: "5826" } })).status).toBe(200);
      expect((await call(auth, "POST", "/api/auth?action=signin", { body: { mobile: a.mobile, pin: PIN } })).status).toBe(401);
    });

    it("deletes the account and everything in it, only with the PIN", async () => {
      const a = await signedUp();
      await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id: "call-del-1", startTime: new Date().toISOString(), duration: 5 } });
      expect((await call(me, "DELETE", "/api/me", { cookie: a.cookie, body: { pin: "9999" } })).status).toBe(401);
      expect((await call(me, "DELETE", "/api/me", { cookie: a.cookie, body: { pin: PIN } })).body.deleted).toBe(true);
      expect((await raw.query("select 1 from yaara_users where phone = $1", ["+91" + a.mobile])).rowCount).toBe(0);
      expect((await raw.query("select 1 from yaara_calls where id = 'call-del-1'")).rowCount).toBe(0);
      expect((await call(auth, "GET", "/api/auth?action=session", { cookie: a.cookie })).body.signedIn).toBe(false);
    });
  });

  describe("calls", () => {
    it("saves a call, builds its transcript from the live lines, and lists it", async () => {
      const a = await signedUp();
      const id = "call-" + Date.now();
      for (const [role, text] of [["user", "Namaste Yaara"], ["yaara", "Namaste! Aaj kaisa din raha?"], ["user", "Accha tha"]]) {
        expect((await call(calls, "POST", "/api/calls?action=message", { cookie: a.cookie, body: { callId: id, role, text } })).status).toBe(200);
      }
      const start = new Date(Date.now() - 60000).toISOString();
      const r = await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id, startTime: start, endTime: new Date().toISOString(), duration: 60, status: "completed" } });
      expect(r.status).toBe(200);
      expect(r.body.call.transcript.map((l: { text: string }) => l.text)).toEqual(["Namaste Yaara", "Namaste! Aaj kaisa din raha?", "Accha tha"]);
      const list = await call(calls, "GET", "/api/calls", { cookie: a.cookie });
      expect(list.body.calls[0]).toMatchObject({ id, duration: 60, status: "completed", hasAudio: false });
    });

    it("keeps Hindi text in the transcript (it used to strip everything that was not ASCII)", async () => {
      const a = await signedUp();
      const id = "call-hi-" + Date.now();
      await call(calls, "POST", "/api/calls?action=message", { cookie: a.cookie, body: { callId: id, role: "user", text: "मैं ठीक हूँ" } });
      const r = await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id, startTime: new Date().toISOString(), duration: 3 } });
      expect(r.body.call.transcript[0].text).toBe("मैं ठीक हूँ");
    });

    it("never shows, changes or deletes another person's calls", async () => {
      const a = await signedUp("Asha");
      const b = await signedUp("Bimla");
      const id = "call-private-" + Date.now();
      await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id, startTime: new Date().toISOString(), duration: 10, transcript: [{ role: "user", text: "secret" }] } });
      expect((await call(calls, "GET", "/api/calls", { cookie: b.cookie })).body.calls.find((c: { id: string }) => c.id === id)).toBeUndefined();
      const takeover = await call(calls, "POST", "/api/calls?action=save", { cookie: b.cookie, body: { id, startTime: new Date().toISOString(), duration: 99, transcript: [{ role: "user", text: "overwritten" }] } });
      expect(takeover.status).toBe(409);
      expect((await call(calls, "DELETE", "/api/calls?id=" + id, { cookie: b.cookie })).body.deleted).toBe(false);
      expect((await call(calls, "PUT", "/api/calls?id=" + id, { cookie: b.cookie, raw: new Uint8Array([1, 2, 3]), headers: { "content-type": "audio/webm" } })).status).toBe(404);
      const still = await call(calls, "GET", "/api/calls", { cookie: a.cookie });
      expect(still.body.calls.find((c: { id: string }) => c.id === id).transcript[0].text).toBe("secret");
    });

    it("stores the recording, plays it back to its owner only, and refuses one over 4 MB", async () => {
      const a = await signedUp();
      const b = await signedUp();
      const id = "call-audio-" + Date.now();
      await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id, startTime: new Date().toISOString(), duration: 2 } });
      const audio = new Uint8Array(2048).map((_, i) => i % 251);
      const put = await call(calls, "PUT", "/api/calls?id=" + id, { cookie: a.cookie, raw: audio, headers: { "content-type": "audio/webm;codecs=opus" } });
      expect(put.body).toEqual({ ok: true, size: 2048 });
      const got = await call(calls, "GET", `/api/calls?id=${id}&audio=1`, { cookie: a.cookie });
      expect(got.status).toBe(200);
      expect(got.headers.get("content-type")).toBe("audio/webm");
      expect(Array.from(got.body as Uint8Array)).toEqual(Array.from(audio));
      expect((await call(calls, "GET", `/api/calls?id=${id}&audio=1`, { cookie: b.cookie })).status).toBe(404);
      expect((await call(calls, "GET", "/api/calls", { cookie: a.cookie })).body.calls[0].hasAudio).toBe(true);
      const big = await call(calls, "PUT", "/api/calls?id=" + id, { cookie: a.cookie, raw: new Uint8Array(4 * 1024 * 1024 + 1), headers: { "content-type": "audio/webm" } });
      expect(big.status).toBe(413);
      const notAudio = await call(calls, "PUT", "/api/calls?id=" + id, { cookie: a.cookie, raw: "x", headers: { "content-type": "text/html" } });
      expect(notAudio.status).toBe(415);
    });

    it("deleting a call removes its recording and its lines", async () => {
      const a = await signedUp();
      const id = "call-gone-" + Date.now();
      await call(calls, "POST", "/api/calls?action=message", { cookie: a.cookie, body: { callId: id, role: "user", text: "hi" } });
      await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id, startTime: new Date().toISOString(), duration: 1 } });
      await call(calls, "PUT", "/api/calls?id=" + id, { cookie: a.cookie, raw: new Uint8Array([1, 2, 3]), headers: { "content-type": "audio/webm" } });
      expect((await call(calls, "DELETE", "/api/calls?id=" + id, { cookie: a.cookie })).body.deleted).toBe(true);
      expect((await raw.query("select 1 from yaara_call_audio where call_id = $1", [id])).rowCount).toBe(0);
      expect((await raw.query("select 1 from yaara_messages where call_id = $1", [id])).rowCount).toBe(0);
    });

    it("refuses bad ids, roles and times", async () => {
      const a = await signedUp();
      expect((await call(calls, "POST", "/api/calls?action=message", { cookie: a.cookie, body: { callId: "x", role: "user", text: "hi" } })).status).toBe(400);
      expect((await call(calls, "POST", "/api/calls?action=message", { cookie: a.cookie, body: { callId: "abcdef1", role: "admin", text: "hi" } })).status).toBe(400);
      expect((await call(calls, "POST", "/api/calls?action=save", { cookie: a.cookie, body: { id: "abcdef2", startTime: "not a date" } })).status).toBe(400);
      expect((await call(calls, "GET", "/api/calls?id=../../etc", { cookie: a.cookie })).status).toBe(400);
      expect((await call(calls, "GET", "/api/calls")).status).toBe(401);
    });
  });

  describe("reviews", () => {
    it("rates and reviews once per person, can be edited, and the summary averages them", async () => {
      const a = await signedUp();
      const b = await signedUp();
      await raw.query("delete from yaara_reviews");
      expect((await call(reviews, "POST", "/api/reviews", { body: { rating: 5 } })).status).toBe(401);
      expect((await call(reviews, "POST", "/api/reviews", { cookie: a.cookie, body: { rating: 0 } })).body.field).toBe("rating");
      expect((await call(reviews, "POST", "/api/reviews", { cookie: a.cookie, body: { rating: 3.5 } })).body.field).toBe("rating");
      expect((await call(reviews, "POST", "/api/reviews", { cookie: a.cookie, body: { rating: 5, text: "x".repeat(501) } })).body.field).toBe("text");
      await call(reviews, "POST", "/api/reviews", { cookie: a.cookie, body: { rating: 3, text: "Theek hai" } });
      const edited = await call(reviews, "POST", "/api/reviews", { cookie: a.cookie, body: { rating: 5, text: "Bahut accha laga" } });
      expect(edited.body.mine).toEqual({ rating: 5, text: "Bahut accha laga" });
      await call(reviews, "POST", "/api/reviews", { cookie: b.cookie, body: { rating: 4 } });
      const pub = await call(reviews, "GET", "/api/reviews");
      expect(pub.body.summary).toEqual({ count: 2, average: 4.5 });
      expect(pub.body.mine).toBeNull();
      expect((await call(reviews, "GET", "/api/reviews", { cookie: a.cookie })).body.mine).toMatchObject({ rating: 5, text: "Bahut accha laga" });
    });
  });
});
