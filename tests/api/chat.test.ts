// api/chat.ts and api/tts.ts with the providers faked: a retired model must not
// take Yaara's voice down again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickGemini, pickGroq } from "../../api/_lib/models";

type Fake = (url: string, init?: RequestInit) => Response | Promise<Response>;
const isGroq = (url: string) => new URL(url).hostname === "api.groq.com";
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const err = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeFetch(fn: Fake) {
  const calls: { url: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return fn(String(url), init);
  });
  return calls;
}

const chatReq = () => new Request("http://localhost/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "system", content: "You are Yaara." }, { role: "user", content: "Hi Yaara" }] }),
});

describe("model picking", () => {
  it("prefers the listed models, then any chat model, never whisper or guard", () => {
    expect(pickGroq(["whisper-large-v3", "openai/gpt-oss-120b", "llama-3.1-8b-instant"])).toBe("openai/gpt-oss-120b");
    expect(pickGroq(["whisper-large-v3", "meta-llama/llama-guard-4-12b", "qwen/qwen3-32b"])).toBe("qwen/qwen3-32b");
    expect(pickGroq(["whisper-large-v3"])).toBeNull();
    expect(pickGemini([
      { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    ])).toBe("gemini-2.5-flash");
    expect(pickGemini([{ name: "models/gemini-3-flash", supportedGenerationMethods: ["generateContent"] }])).toBe("gemini-3-flash");
    expect(pickGemini([{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["embedContent"] }])).toBeNull();
  });
});

describe("api/chat", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GROQ_API_KEY = "test-groq";
    process.env.GEMINI_API_KEY = "test-gemini";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("when the Groq model is retired, asks Groq for its models and answers with one of them", async () => {
    const calls = fakeFetch((url, init) => {
      if (url.endsWith("/openai/v1/models")) return ok({ data: [{ id: "whisper-large-v3" }, { id: "qwen/qwen3-32b" }] });
      const body = JSON.parse(String(init?.body));
      if (body.model === "qwen/qwen3-32b") return ok({ choices: [{ message: { content: "Namaste! Kaise ho?" } }] });
      return err(404, { error: { message: `The model \`${body.model}\` does not exist`, code: "model_not_found" } });
    });
    const handler = (await import("../../api/chat")).default;
    const r = await handler(chatReq());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ text: "Namaste! Kaise ho?", provider: "groq" });
    // The next reply goes straight to the model that worked.
    await handler(chatReq());
    expect(calls.filter((c) => c.url.endsWith("/models")).length).toBe(1);
    expect(calls.at(-1)?.body.model).toBe("qwen/qwen3-32b");
  });

  it("falls back to Gemini, and finds a current Gemini model when the first one is gone", async () => {
    fakeFetch((url) => {
      if (isGroq(url)) return err(401, { error: { message: "Invalid API Key" } });
      if (url.includes("/v1beta/models?")) return ok({ models: [{ name: "models/gemini-3-flash", supportedGenerationMethods: ["generateContent"] }] });
      if (url.includes("gemini-3-flash:generateContent")) return ok({ candidates: [{ content: { parts: [{ text: "Haan ji, " }, { text: "boliye!" }] } }] });
      return err(404, { error: { message: "models/gemini-2.5-flash is not found", status: "NOT_FOUND" } });
    });
    const handler = (await import("../../api/chat")).default;
    const r = await handler(chatReq());
    expect(await r.json()).toEqual({ text: "Haan ji, boliye!", provider: "gemini" });
  });

  it("a Groq rate limit falls through to Gemini; both limited says 429", async () => {
    fakeFetch((url) => (isGroq(url) ? err(429, { error: "slow down" }) : ok({ candidates: [{ content: { parts: [{ text: "Ji" }] } }] })));
    let handler = (await import("../../api/chat")).default;
    expect(await (await handler(chatReq())).json()).toMatchObject({ provider: "gemini" });
    vi.resetModules();
    fakeFetch(() => err(429, { error: "slow down" }));
    handler = (await import("../../api/chat")).default;
    expect((await handler(chatReq())).status).toBe(429);
  });

  it("puts the system prompt where each provider expects it", async () => {
    const calls = fakeFetch((url) => (isGroq(url) ? err(500, {}) : ok({ candidates: [{ content: { parts: [{ text: "Ji" }] } }] })));
    const handler = (await import("../../api/chat")).default;
    await handler(chatReq());
    expect(calls[0].body.messages[0]).toMatchObject({ role: "system" });
    expect(calls[0].body.messages[0].content).toContain("You are Yaara.");
    const gem = calls.find((c) => c.url.includes("generateContent"));
    expect(gem?.body.systemInstruction.parts[0].text).toContain("You are Yaara.");
    expect(gem?.body.contents).toEqual([{ role: "user", parts: [{ text: "Hi Yaara" }] }]);
  });
});

describe("api/tts", () => {
  const ttsReq = (body: object) => new Request("http://localhost/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ELEVENLABS_API_KEY;
  });

  it("without a key, says fallback straight away so the phone speaks", async () => {
    const handler = (await import("../../api/tts")).default;
    const r = await handler(ttsReq({ text: "Namaste" }));
    expect(r.status).toBe(503);
    expect((await r.json()).fallback).toBe(true);
  });

  it("speaks with the chosen ElevenLabs voice and returns mp3 audio", async () => {
    process.env.ELEVENLABS_API_KEY = "test-eleven";
    const calls = fakeFetch(() => new Response(new Uint8Array(500).fill(7), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const handler = (await import("../../api/tts")).default;
    const r = await handler(ttsReq({ text: "Namaste", voiceId: "EXAVITQu4vr4xnSDxMaL" }));
    const body = await r.json();
    expect(body.mime).toBe("audio/mpeg");
    expect(atob(body.audioContent).length).toBe(500);
    expect(calls[0].url).toContain("/text-to-speech/EXAVITQu4vr4xnSDxMaL");
  });

  it("an unusable voice id gets the default voice; a used-up quota means fallback", async () => {
    process.env.ELEVENLABS_API_KEY = "test-eleven";
    const calls = fakeFetch(() => err(401, { detail: { status: "quota_exceeded" } }));
    const handler = (await import("../../api/tts")).default;
    const r = await handler(ttsReq({ text: "Namaste", voiceId: "../../evil", gender: "MALE" }));
    expect(calls[0].url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
    expect(r.status).toBe(503);
    expect((await r.json()).fallback).toBe(true);
  });
});
