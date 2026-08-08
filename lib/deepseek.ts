type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export async function generateDeepSeekReply(messages: ChatMessage[]): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const system = messages.filter(message => message.role === "system").map(message => message.content).join("\n\n");
    const contents = messages.filter(message => message.role !== "system").map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      const data = await response.json() as GeminiResponse;
      const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
      if (reply) return reply.slice(0, 3_500);
    }
  }

  // Temporary fallback while the Google key is being configured or if Google is unavailable.
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
        messages,
        thinking: { type: "disabled" },
        max_tokens: 350,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok) {
      const data = await response.json() as DeepSeekResponse;
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply.slice(0, 3_500);
    }
  }

  // Vercel deployments authenticate to AI Gateway with their built-in OIDC
  // identity. This keeps AI available without exposing another provider key.
  const { generateText } = await import("ai");
  const result = await generateText({
    model: "deepseek/deepseek-v4-flash-0731",
    messages,
    maxOutputTokens: 350,
  });
  const reply = result.text.trim();
  if (!reply) throw new Error("AI provider returned an empty reply");
  return reply.slice(0, 3_500);
}
