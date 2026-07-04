/**
 * Send SMS via Africa's Talking.
 * Normalizes Ghana numbers (024XXXXXXX → +233XXXXXXXX).
 * Fire-and-forget safe — never throws, always resolves.
 */
function normalizeGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendCustomerSMS(phone: string, message: string): Promise<void> {
  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return;

  const body = new URLSearchParams({ username, to: normalizeGhanaPhone(phone), message });
  if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);

  await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  }).catch(() => {});
}

export function orderReceivedSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  const first    = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data order (Ref: ${shortRef}) has been received. Delivery in progress to ${phone}. Track: elitedata1.com/track?ref=${shortRef}`;
}

export function orderDeliveredSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  const first    = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data has been delivered to ${phone}. Ref: ${shortRef}. Thank you for choosing Elite Data!`;
}

export function orderConfirmedSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  return orderDeliveredSMS(name, network, size, phone, reference);
}
