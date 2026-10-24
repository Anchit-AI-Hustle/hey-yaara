// The whole app in a real browser: `npm run dev` (with its /api) against a real
// Postgres, Chromium driven by Playwright. The AI and voice providers are faked
// at the network edge; everything else is the real code.
//
//   TEST_DATABASE_URL=postgres://... npm run test:e2e
//   (PW_CHROMIUM=/path/to/chromium to use a specific browser)

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { chromium } from "playwright";

const DB = process.env.TEST_DATABASE_URL;
if (!DB) { console.log("skip: TEST_DATABASE_URL is not set"); process.exit(0); }
const PORT = 8090 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;
const PIN = "4071";

let passed = 0;
const failed = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed.push(name); console.log("  FAIL " + name + "\n       " + String(e?.stack || e).split("\n").slice(0, 4).join("\n       ")); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// A one-second 440 Hz WAV: a real, playable recording.
function wav() {
  const rate = 8000, n = rate, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

const raw = new pg.Pool({ connectionString: DB, max: 2 });
await raw.query("drop table if exists yaara_reviews, yaara_call_audio, yaara_messages, yaara_calls, yaara_sessions, yaara_users cascade");

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "localhost"], {
  env: { ...process.env, DATABASE_URL: DB, GROQ_API_KEY: "", GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // its own process group, so the vite under npx stops with it
});
const stopServer = () => { try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ } };
process.on("exit", stopServer);
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try { up = (await fetch(BASE + "/api/auth?action=status")).ok; } catch { /* starting */ }
  if (!up) await sleep(500);
}
if (!up || server.exitCode !== null) { console.log("dev server did not start:\n" + serverLog); stopServer(); process.exit(1); }

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

/** A fresh browser profile; console errors and failed requests are collected. */
async function newPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, permissions: ["microphone"] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|WebSocket|vite/i.test(m.text())) page.errors.push("console: " + m.text()); });
  return { ctx, page };
}

let n = 0;
const run = String(Date.now()).slice(-6);
const freshMobile = () => "8" + run + String(n++).padStart(3, "0");

async function signUp(page, name, mobile) {
  await page.goto(BASE + "/signup");
  await page.fill("#name", name);
  await page.fill("#mobile", mobile);
  await page.fill("#pin", PIN);
  await page.fill("#confirmPin", PIN);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + "/profile");
}

try {
  await test("home loads with no errors and offers to rate Yaara", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/");
    await page.getByRole("button", { name: /Rate kijiye/ }).waitFor();
    assert((await page.textContent("body")).includes("Jaldi kholiye"), "shortcuts heading missing");
    assert(!(await page.textContent("body")).includes("2 hours ago"), "fake history is back");
    for (const path of ["/games", "/music", "/review"]) {
      await page.goto(BASE + path);
      await sleep(600);
    }
    assert(page.errors.length === 0, page.errors.join("\n"));
    await ctx.close();
  });

  await test("/get offers the Android and iPhone apps, the visitor's phone first, on phone, tablet and desktop", async () => {
    const release = { tag_name: "v1.0.9", published_at: "2026-10-24T10:00:00Z", assets: [{ name: "hey-yaara.apk", size: 4_800_000 }, { name: "hey-yaara-ios.ipa", size: 3_300_000 }] };
    const phones = {
      android: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
      ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    };
    for (const [width, height, ua, first] of [[390, 844, phones.android, "Android phone"], [820, 1180, phones.ios, "iPhone aur iPad"], [1440, 900, undefined, "Android phone"]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, userAgent: ua });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(release) }));
      await page.goto(BASE + "/get");
      await page.getByText("Version 1.0.9 · 4.6 MB").waitFor();
      assert((await page.locator("section h2").first().textContent()) === first, `${width}px: ${first} should come first`);
      const hrefs = await page.locator("a[href*='/releases/latest/download/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      assert(hrefs.some((h) => h.endsWith("/hey-yaara.apk")) && hrefs.some((h) => h.endsWith("/hey-yaara-ios.ipa")), "download links: " + hrefs);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `${width}px scrolls sideways by ${overflow}px`);
      assert(errors.length === 0, errors.join("\n"));
      await ctx.close();
    }
  });

  await test("talking, history and profile need a sign-in", async () => {
    const { ctx, page } = await newPage();
    for (const path of ["/talk", "/calls", "/profile"]) {
      await page.goto(BASE + path);
      await page.waitForURL(BASE + "/signin");
    }
    await ctx.close();
  });

  const a = { name: "Kamla Devi", mobile: freshMobile() };
  await test("sign up checks each field in words, then creates the account and opens the profile", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signup");
    await page.click('button[type="submit"]');
    assert((await page.textContent("#name-error")).includes("naam"), "no name error");
    await page.fill("#name", a.name);
    await page.fill("#mobile", "+91 " + a.mobile.slice(0, 5) + " " + a.mobile.slice(5));
    assert((await page.inputValue("#mobile")) === a.mobile, "pasted +91 number not cleaned: " + (await page.inputValue("#mobile")));
    await page.fill("#pin", "1234");
    await page.fill("#confirmPin", "1234");
    await page.click('button[type="submit"]');
    await page.locator("#pin-error").waitFor();
    assert((await page.textContent("#pin-error")).includes("aasaan"), "weak PIN not refused");
    await page.fill("#pin", PIN);
    await page.fill("#confirmPin", "4072");
    await page.click('button[type="submit"]');
    assert((await page.textContent("#confirmPin-error")).includes("alag"), "mismatch not caught");
    await page.fill("#pin", PIN);
    await page.fill("#confirmPin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/profile");
    await page.waitForFunction((name) => document.querySelector("#profile-name")?.value === name, a.name);
    assert((await page.inputValue("#profile-mobile")) === "+91 " + a.mobile, "profile mobile");
    const row = (await raw.query("select pin_hash from yaara_users where phone = $1", ["+91" + a.mobile])).rows[0];
    assert(row && !row.pin_hash.includes(PIN), "account not stored with a hash");
    assert(page.errors.length === 0, page.errors.join("\n"));
    await ctx.close();
  });

  await test("the profile saves to the account and survives a reload", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/profile");
    await page.fill("#profile-age", "72");
    await page.selectOption("#profile-gender", "female");
    await page.selectOption("#profile-female-voice", "EXAVITQu4vr4xnSDxMaL");
    await page.click('button:has-text("Save Profile Details")');
    await page.getByText("Aapki jaankari safe save ho gayi hai.").first().waitFor();
    await page.reload();
    await page.waitForSelector("#profile-age");
    await page.waitForFunction(() => document.querySelector("#profile-age")?.value === "72");
    assert((await page.inputValue("#profile-gender")) === "female", "gender did not persist: " + (await page.inputValue("#profile-gender")));
    assert((await page.inputValue("#profile-female-voice")) === "EXAVITQu4vr4xnSDxMaL", "voice did not persist");
    await ctx.close();
  });

  await test("sign in: unknown number, wrong PIN countdown, existing number on sign up", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", freshMobile());
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.getByText("Is number ka koi account nahi hai").waitFor();
    await page.getByRole("link", { name: "Account banaiye" }).first().waitFor();
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", "9999");
    await page.click('button[type="submit"]');
    await page.getByText("PIN galat hai. 4 tries baaki.").waitFor();
    assert((await page.inputValue("#pin")) === "", "wrong PIN not cleared");
    await page.goto(BASE + "/signup");
    await page.fill("#name", "Someone");
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", "5826");
    await page.fill("#confirmPin", "5826");
    await page.click('button[type="submit"]');
    await page.getByText("Is number ka account pehle se hai").waitFor();
    await ctx.close();
  });

  await test("a call: Yaara greets, both sides show, it is saved with its transcript and recording", async () => {
    const { ctx, page } = await newPage();
    // The AI and the voice are faked; the call, save and upload are real.
    await page.route("**/api/chat", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Namaste Kamla ji! Aaj kaisa din raha?" }) }));
    await page.route("**/api/tts", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ audioContent: wav().toString("base64"), mime: "audio/wav" }) }));
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/talk");
    const start = page.getByRole("button", { name: "Start call with Yaara" });
    await start.click();
    await page.getByText("Namaste Kamla ji! Aaj kaisa din raha?").first().waitFor({ timeout: 20000 });
    await sleep(2500);
    const end = page.getByRole("button", { name: "End Call" });
    await end.click();
    let saved = null;
    for (let i = 0; i < 40 && !saved; i++) {
      saved = (await raw.query("select c.transcript, c.has_audio from yaara_calls c join yaara_users u on u.id = c.user_id where u.phone = $1", ["+91" + a.mobile])).rows[0];
      if (!saved) await sleep(500);
    }
    assert(saved, "call not saved");
    assert(saved.transcript.some((l) => l.role === "yaara" && l.text.includes("Namaste Kamla ji")), "transcript missing Yaara's line: " + JSON.stringify(saved.transcript));
    for (let i = 0; i < 20 && !saved.has_audio; i++) {
      await sleep(500);
      saved = (await raw.query("select c.transcript, c.has_audio from yaara_calls c join yaara_users u on u.id = c.user_id where u.phone = $1", ["+91" + a.mobile])).rows[0];
    }
    assert(saved.has_audio, "recording not uploaded");
    const msgs = (await raw.query("select role from yaara_messages m join yaara_users u on u.id = m.user_id where u.phone = $1", ["+91" + a.mobile])).rows;
    assert(msgs.some((m) => m.role === "yaara"), "live lines not saved (role 'assistant' was refused before)");
    assert(page.errors.length === 0, page.errors.join("\n"));
    await ctx.close();
  });

  const b = { name: "Bimla Sharma", mobile: freshMobile() };
  await test("call history shows the person's own calls, plays the recording, and hides them from others", async () => {
    // A second call with a known recording, saved through the API as Kamla.
    const login = await fetch(BASE + "/api/auth?action=signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mobile: a.mobile, pin: PIN }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const id = "e2e-call-" + run;
    await fetch(BASE + "/api/calls?action=save", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id, startTime: new Date(Date.now() - 3600_000).toISOString(), endTime: new Date().toISOString(), duration: 125, transcript: [{ role: "user", text: "Mera bhajan sunao" }, { role: "yaara", text: "Zaroor, yeh rahi Hanuman Chalisa." }] }) });
    const put = await fetch(BASE + "/api/calls?id=" + id, { method: "PUT", headers: { "content-type": "audio/wav", cookie }, body: wav() });
    assert(put.ok, "upload failed " + put.status);

    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/calls");
    await page.getByText("2 calls").waitFor();
    const card = page.locator(".glass-card", { hasText: "2:05" }).first();
    await card.getByRole("button", { name: "Play recording" }).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes("Loading recording..."), null, { timeout: 15000 });
    await card.getByRole("button", { name: "Play recording" }).click();
    await card.getByRole("button", { name: "Pause recording" }).waitFor();
    await card.getByRole("button", { name: /View Transcript/ }).click();
    await card.getByText("Zaroor, yeh rahi Hanuman Chalisa.").waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Transcript", exact: true }).click()]);
    assert(download.suggestedFilename().endsWith(".txt"), "transcript download is not a text file");
    assert(page.errors.length === 0, page.errors.join("\n"));
    await ctx.close();

    const other = await newPage();
    await signUp(other.page, b.name, b.mobile);
    await other.page.goto(BASE + "/calls");
    await other.page.getByText("No calls yet").waitFor();
    assert(!(await other.page.textContent("body")).includes("Hanuman"), "another person's call is visible");
    await other.ctx.close();
  });

  await test("deleting a call removes it and its recording", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/calls");
    await page.getByText("2 calls").waitFor();
    page.once("dialog", (d) => d.accept());
    await page.locator(".glass-card", { hasText: "2:05" }).first().getByRole("button", { name: /Delete/ }).click();
    await page.getByText("1 call").first().waitFor();
    assert((await raw.query("select 1 from yaara_call_audio where call_id = $1", ["e2e-call-" + run])).rowCount === 0, "recording left behind");
    await ctx.close();
  });

  await test("rate and review: stars, words, saved, then share links carry a matching post", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/review");
    await page.getByRole("link", { name: "Sign in" }).first().waitFor();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", b.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/review");
    await page.getByRole("button", { name: "Review save kijiye" }).click();
    await page.getByText("Pehle 1 se 5 stars chuniye.").waitFor();
    await page.getByRole("radio", { name: /^5 stars/ }).click();
    await page.fill("#review", "Roz shaam ko Yaara se baat karke accha lagta hai");
    await page.getByRole("button", { name: "Review save kijiye" }).click();
    await page.getByRole("heading", { name: "Doston ke saath share kijiye" }).waitFor();
    const post = await page.locator("pre").textContent();
    assert(post.startsWith("★★★★★ Hey Yaara"), "post: " + post);
    assert(post.includes('"Roz shaam ko Yaara se baat karke accha lagta hai"'), "review not quoted");
    const wa = await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href");
    assert(wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes("Roz shaam"), "WhatsApp link: " + wa);
    const x = await page.getByRole("link", { name: "X" }).getAttribute("href");
    assert(x.startsWith("https://x.com/intent/post?text="), "X link");
    await page.getByText("5.0").waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Review saved" }).waitFor();
    assert((await page.inputValue("#review")).includes("Roz shaam"), "review not loaded back");
    assert((await page.getByRole("radio", { name: /^5 stars/ }).getAttribute("aria-checked")) === "true", "stars not loaded back");
    // A low rating changes the words: no invitation put in the person's mouth.
    await page.getByRole("radio", { name: /^2 stars/ }).click();
    await page.getByRole("button", { name: "Review update kijiye" }).click();
    await page.waitForFunction(() => document.querySelector("pre")?.textContent?.startsWith("★★☆☆☆"));
    assert(!(await page.locator("pre").textContent()).includes("Aap bhi try kijiye"), "low rating still invites");
    assert(page.errors.length === 0, page.errors.join("\n"));
    await ctx.close();
  });

  await test("change PIN, sign out, sign in with the new PIN", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", b.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/profile");
    await page.getByRole("button", { name: "PIN badaliye" }).click();
    await page.fill("#pin-now", PIN);
    await page.fill("#pin-new", "5826");
    await page.fill("#pin-again", "5826");
    await page.getByRole("button", { name: "Naya PIN rakhiye" }).click();
    await page.getByText("PIN badal gaya").first().waitFor();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(BASE + "/signin");
    await page.goto(BASE + "/profile");
    await page.waitForURL(BASE + "/signin");
    await page.fill("#mobile", b.mobile);
    await page.fill("#pin", "5826");
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await ctx.close();
  });

  await test("delete account needs the PIN and removes everything", async () => {
    const { ctx, page } = await newPage();
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", b.mobile);
    await page.fill("#pin", "5826");
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    await page.goto(BASE + "/profile");
    await page.getByRole("button", { name: "Account delete kijiye" }).click();
    await page.fill("#pin-delete", "1111");
    await page.getByRole("button", { name: "Haan, sab delete kijiye" }).click();
    await page.getByText("PIN galat hai. Account delete nahi hua.").waitFor();
    await page.fill("#pin-delete", "5826");
    await page.getByRole("button", { name: "Haan, sab delete kijiye" }).click();
    await page.waitForURL(BASE + "/signin");
    assert((await raw.query("select 1 from yaara_users where phone = $1", ["+91" + b.mobile])).rowCount === 0, "account still there");
    assert((await raw.query("select 1 from yaara_reviews r left join yaara_users u on u.id = r.user_id where u.id is null")).rowCount === 0, "orphan review");
    await ctx.close();
  });

  await test("phone width (360px): no sideways scroll on sign in, sign up, review, profile, history", async () => {
    const { ctx, page } = await newPage({ width: 360, height: 760 });
    const wide = async (path) => {
      await page.goto(BASE + path);
      await sleep(400);
      return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    };
    for (const p of ["/signin", "/signup", "/review", "/"]) {
      assert((await wide(p)) <= 0, p + " scrolls sideways");
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/phone${p === "/" ? "-home" : p.replace("/", "-")}-out.png`, fullPage: false });
    }
    await page.goto(BASE + "/signin");
    await page.fill("#mobile", a.mobile);
    await page.fill("#pin", PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(BASE + "/");
    for (const p of ["/profile", "/calls", "/review"]) {
      assert((await wide(p)) <= 0, p + " scrolls sideways");
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/phone${p.replace("/", "-")}.png`, fullPage: true });
    }
    await ctx.close();
  });
} finally {
  await browser.close();
  stopServer();
  await raw.end();
}

console.log(`\n${passed}/${passed + failed.length} passed`);
if (failed.length) {
  console.log("\n--- dev server log (tail) ---\n" + serverLog.split("\n").slice(-30).join("\n"));
  process.exit(1);
}
