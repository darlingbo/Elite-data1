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
