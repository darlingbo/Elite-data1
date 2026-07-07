function normalizeGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
  return `+${digits}`;
}

async function atRequest(apiKey: string, username: string, to: string, message: string, senderId?: string): Promise<{ ok: boolean; status: number; text: string }> {
  const body = new URLSearchParams({ username, to, message });
  if (senderId) body.set("from", senderId);

  try {
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: String(err) };
  }
}

export async function sendCustomerSMS(phone: string, message: string): Promise<void> {
  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  if (!apiKey || !username) {
    const { sendAdminAlert } = await import("./telegram");
    sendAdminAlert(
      "📵 SMS NOT WORKING\nAT_API_KEY or AT_USERNAME is missing in Vercel env vars.\nGo to Vercel → Settings → Environment Variables and add:\n• AT_API_KEY\n• AT_USERNAME = Darlingboy99"
    ).catch(() => {});
    return;
  }

  const to = normalizeGhanaPhone(phone);
  const senderId = process.env.AT_SENDER_ID;

  // Try with sender ID first (if configured), fall back to without if it fails
  const first = await atRequest(apiKey, username, to, message, senderId);

  if (first.ok) return;

  // First attempt failed — if we used a sender ID, retry without it
  if (senderId) {
    const retry = await atRequest(apiKey, username, to, message);
    if (retry.ok) return;

    // Both failed — alert admin with detail
    const { sendAdminAlert } = await import("./telegram");
    sendAdminAlert(
      `📵 SMS FAILED (both attempts)\nTo: ${phone}\nWith sender ID: ${first.status} ${first.text.slice(0, 150)}\nWithout sender ID: ${retry.status} ${retry.text.slice(0, 150)}`
    ).catch(() => {});
    return;
  }

  // No sender ID — single attempt failed
  const { sendAdminAlert } = await import("./telegram");
  sendAdminAlert(
    `📵 SMS FAILED\nTo: ${phone}\nStatus: ${first.status}\n${first.text.slice(0, 300)}`
  ).catch(() => {});
}

function shortRef(reference: string): string {
  return reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
}

export function orderReceivedSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} order has been received. Payment confirmed. Ref: ${shortRef(reference)}. Your data will be delivered to ${phone} shortly. Thank you - EliteData1`;
}

export function orderConfirmedSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data has been successfully delivered to ${phone}. Ref: ${shortRef(reference)}. Thank you for choosing EliteData1!`;
}

export function orderFailedSMS(name: string, network: string, size: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  return `Hi ${first}! Sorry, your ${network.toUpperCase()} ${size} order (Ref: ${shortRef(reference)}) could not be delivered. Please fill the refund form on our site. Your refund will be processed within 12 hours. - EliteData1`;
}

// Alias kept for any existing callers
export const orderDeliveredSMS = orderConfirmedSMS;
