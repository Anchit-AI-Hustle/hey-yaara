/**
 * api/chat.ts
 *
 * Server-side proxy to Groq, with Gemini as the fallback. The keys stay on the
 * server. Model names are not hard-coded to one: see api/_lib/models.ts.
 */

import { GEMINI_PREFERRED, GROQ_PREFERRED, isModelGone, pickGemini, pickGroq } from "./_lib/models.js";

export const config = {
  runtime: "edge",
};

type Msg = { role: string; content: string };

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const FINAL_INSTRUCTION = `
CRITICAL OUTPUT RULES:
- Write in Roman English script (A-Z alphabet). You may use Hindi words in Roman script (Hinglish) like "kya haal hai", "bahut accha".
- Keep responses to 1-2 short sentences. Be concise and conversational.
- Be spontaneous, warm, and human-like. Sound like a real phone call.
- DO NOT repeat back what the user said. Always add new meaning.
- If you are unsure about something, ask a brief clarification question.
- NEVER hallucinate or make up facts.`;

// Remembered per edge instance, so the model list is fetched at most once.
let groqModel: string | null = null;
let geminiModel: string | null = null;

async function groqModels(key: string): Promise<string[]> {
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) return [];
  const d = (await r.json()) as { data?: { id: string }[] };
  return (d.data || []).map((m) => m.id);
}

async function geminiModels(key: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`);
  if (!r.ok) return [];
  const d = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return d.models || [];
}

function callGroq(key: string, model: string, system: string, convo: Msg[]) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...convo.slice(-10)],
      temperature: 0.7,
      max_tokens: 200,
      top_p: 0.9,
    }),
  });
}

function callGemini(key: string, model: string, system: string, convo: Msg[]) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: convo.slice(-10).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 300, topP: 0.9 },
    }),
  });
}

type Provider = {
  name: string;
  key: string | undefined;
  call: (key: string, model: string, system: string, convo: Msg[]) => Promise<Response>;
  first: () => string;
  pick: (key: string) => Promise<string | null>;
  remember: (model: string) => void;
  text: (d: unknown) => string;
};

/** One provider: its last good model, or the preferred one; on "model gone", ask it. */
async function tryProvider(p: Provider, system: string, convo: Msg[]): Promise<Response | "rate-limited" | null> {
  if (!p.key) return null;
  try {
    let model = p.first();
    let r = await p.call(p.key, model, system, convo);
    if (!r.ok) {
      const err = await r.text();
      if (r.status === 429) return "rate-limited";
      if (!isModelGone(r.status, err)) {
        console.error(`[API] ${p.name} error:`, r.status, err.slice(0, 300));
        return null;
      }
      const picked = await p.pick(p.key);
      if (!picked || picked === model) {
        console.error(`[API] ${p.name}: no chat model available`, err.slice(0, 200));
        return null;
      }
      model = picked;
      r = await p.call(p.key, model, system, convo);
      if (!r.ok) {
        console.error(`[API] ${p.name} error:`, r.status, (await r.text()).slice(0, 300));
        return null;
      }
    }
    const text = p.text(await r.json()).trim();
    if (!text) return null;
    p.remember(model);
    return reply({ text, provider: p.name });
  } catch (e) {
    console.error(`[API] ${p.name} call failed:`, (e as Error).message);
    return null;
  }
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.VITE_LLM_API_KEY;
  if (!groqKey && !geminiKey) return reply({ error: "No AI API key configured." }, 500);

  let body: { messages?: Msg[]; systemInstruction?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Send JSON." }, 400);
  }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const system = (messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n")
    || body.systemInstruction || "You are Yaara, a friendly voice agent.") + FINAL_INSTRUCTION;
  const convo = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  if (!convo.length) return reply({ error: "messages are required" }, 400);

  const providers: Provider[] = [
    {
      name: "groq",
      key: groqKey,
      call: callGroq,
      first: () => groqModel || GROQ_PREFERRED[0],
      pick: async (k) => pickGroq(await groqModels(k)),
      remember: (m) => { groqModel = m; },
      text: (d) => (d as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content || "",
    },
    {
      name: "gemini",
      key: geminiKey,
      call: callGemini,
      first: () => geminiModel || GEMINI_PREFERRED[0],
      pick: async (k) => pickGemini(await geminiModels(k)),
      remember: (m) => { geminiModel = m; },
      text: (d) => ((d as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "").join(""),
    },
  ];
  let rateLimited = false;
  for (const p of providers) {
    const r = await tryProvider(p, system, convo);
    if (r === "rate-limited") rateLimited = true;
    else if (r) return r;
  }
  if (rateLimited) return reply({ error: "Rate limit reached. Please wait." }, 429);
  return reply({ error: "AI provider error. Both backends failed." }, 502);
}
