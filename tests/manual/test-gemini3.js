const fetch = require('node-fetch') || globalThis.fetch;
const apiKey = process.env.GEMINI_API_KEY;

async function run() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required. See tests/manual/README.md.");

  const payloadMessages = [
    { role: "system", content: "You are a helpful assistant for elderly people in India. Be warm, patient, and use simple language." },
    { role: "system", content: "Respond to the latest user message naturally." },
    { role: "user", content: "hello" }
  ];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: payloadMessages.map(m => m.role + ": " + m.content).join("\n\n") }] }
        ],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0.95,
        }
      }),
    });

    if (!response.ok) {
      console.error("HTTP ERROR:", response.status, await response.text());
      return;
    }
    const result = await response.json();
    const assistantMessage = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    console.log("Success! Message:", assistantMessage);
  } catch (error) {
    console.error("CATCH ERROR:", error);
    process.exitCode = 1;
  }
}
run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
