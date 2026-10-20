/**
 * api/tts.ts
 *
 * Yaara's voice through ElevenLabs (the voice picker in the profile holds
 * ElevenLabs voice ids). The key stays on the server. When there is no key, the
 * monthly free quota is used up, or the voice is unknown, this answers quickly
 * with { fallback: true } and the app speaks with the phone's own voice.
 */

export const config = {
  runtime: "edge",
};

type TtsRequest = { text?: string; gender?: "FEMALE" | "MALE"; voiceId?: string };

// Rachel and Adam: the profile's defaults.
const DEFAULT_VOICES = { FEMALE: "21m00Tcm4TlvDq8ikWAM", MALE: "pNInz6obpgDQGcFmaJgB" };
const VOICE_RE = /^[A-Za-z0-9]{16,32}$/;
const TIMEOUT_MS = 12000;
// Fast and multilingual; when ElevenLabs rejects the model, the call is retried
// with the account's default model.
const MODEL = "eleven_flash_v2_5";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function speak(key: string, voice: string, text: string, model: string | null, signal: AbortSignal) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(model ? { text, model_id: model } : { text }),
    signal,
  });
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return reply({ fallback: true, error: "No voice service configured." }, 503);

  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return reply({ error: "Send JSON." }, 400);
  }
  const text = String(body.text || "").trim().slice(0, 500);
  if (!text) return reply({ error: "Text is required." }, 400);
  const voice = VOICE_RE.test(String(body.voiceId || "")) ? String(body.voiceId) : DEFAULT_VOICES[body.gender === "MALE" ? "MALE" : "FEMALE"];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let r = await speak(key, voice, text, MODEL, controller.signal);
    if (!r.ok && r.status === 400 && /model/i.test(await r.clone().text())) {
      r = await speak(key, voice, text, null, controller.signal);
    }
    if (!r.ok) {
      const details = (await r.text()).slice(0, 300);
      console.error("[TTS] ElevenLabs error:", r.status, details);
      // Quota used up, key revoked, or voice gone: let the phone speak instead.
      return reply({ fallback: true, error: r.status === 429 ? "Voice rate limit reached." : "Voice service unavailable." }, r.status === 429 ? 429 : 503);
    }
    const audio = await r.arrayBuffer();
    if (audio.byteLength < 100) return reply({ fallback: true, error: "Empty audio." }, 503);
    return reply({ audioContent: toBase64(audio), mime: "audio/mpeg", provider: "elevenlabs" });
  } catch (e) {
    const timedOut = (e as Error).name === "AbortError";
    return reply({ fallback: true, error: timedOut ? "Voice service timed out." : "Voice service failed." }, timedOut ? 504 : 503);
  } finally {
    clearTimeout(timer);
  }
}
