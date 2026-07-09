import { sendAdminAlert } from "./telegram";

function normalizeGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendCustomerSMS(phone: string, message: string): Promise<void> {
  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  if (!apiKey || !username) {
    sendAdminAlert(
      "📵 SMS NOT WORKING\nAT_API_KEY or AT_USERNAME missing in Vercel env vars.\nAdd:\n• AT_API_KEY\n• AT_USERNAME = Darlingboy99"
    ).catch(() => {});
    return;
  }

  const body = new URLSearchParams({
    username,
    to: normalizeGhanaPhone(phone),
    message,
  });
  // Do NOT send sender ID — AT silently drops messages when sender ID is pending
  // Add it back only after AT confirms it is fully live

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
    if (!res.ok) {
      sendAdminAlert(
        `📵 SMS FAILED\nTo: ${phone}\nStatus: ${res.status}\n${text.slice(0, 300)}`
      ).catch(() => {});
    }
  } catch (err) {
    sendAdminAlert(`📵 SMS ERROR\nTo: ${phone}\n${String(err).slice(0, 200)}`).catch(() => {});
  }
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
