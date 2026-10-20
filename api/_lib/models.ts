// Which chat model to call. Providers retire model names (llama-3.3-70b-versatile
// and gemini-1.5-flash both stopped answering), so instead of one hard-coded
// name: try the preferred ones, and when a provider says "model not found",
// ask it which models it has and pick the best chat model from that list.
// No Node imports: api/chat.ts runs on the edge runtime.

export const GROQ_PREFERRED = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

export const GEMINI_PREFERRED = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
];

// Not chat models, whatever their names say.
const NOT_CHAT = /whisper|guard|tts|playai|orpheus|embed|vision-only|prompt|compound|distil|aqa|imagen|veo|audio|image|live|native/i;

/** Best Groq chat model from the provider's own list. */
export function pickGroq(available: string[]): string | null {
  for (const m of GROQ_PREFERRED) if (available.includes(m)) return m;
  return available.find((m) => !NOT_CHAT.test(m) && /llama|gpt-oss|qwen|kimi|gemma|mistral/i.test(m)) || null;
}

/** Best Gemini model that can generateContent, from ListModels. */
export function pickGemini(models: { name: string; supportedGenerationMethods?: string[] }[]): string | null {
  const usable = models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => !NOT_CHAT.test(n));
  for (const m of GEMINI_PREFERRED) if (usable.includes(m)) return m;
  return usable.find((n) => /flash/.test(n)) || usable.find((n) => /^gemini/.test(n)) || null;
}

export const isModelGone = (status: number, body: string) =>
  status === 404 || /model_not_found|decommissioned|not found|does not exist|no longer supported/i.test(body);
