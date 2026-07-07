const BASE = "https://messagepilot.io/api/v1";

export async function sendAlert(title: string, message: string): Promise<void> {
  const apiKey  = process.env.MESSAGEPILOT_API_KEY;
  const channel = process.env.MESSAGEPILOT_CHANNEL ?? "whatsapp";
  const to      = process.env.MESSAGEPILOT_TO;
  if (!apiKey || !to) return;

  await fetch(`${BASE}/notify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, to, title, message }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}
