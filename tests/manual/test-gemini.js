const apiKey = process.env.GEMINI_API_KEY;
const payloadMessages = [{role: "system", content: "You are a friendly bot"}, {role: "user", content: "hello"}];

async function run() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required. See tests/manual/README.md.");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`, {
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
        temperature: 0.9,
      }
    }),
  });

  const result = await response.text();
  console.log(response.status);
  console.log(result);
}
run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
