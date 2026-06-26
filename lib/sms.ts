/**
 * Send an SMS to a customer via Africa's Talking.
 * Normalises Ghana numbers (024XXXXXXX → +233XXXXXXXX).
 * Fire-and-forget safe — never throws, always resolves.
 */
export async function sendCustomerSMS(phone: string, message: string): Promise<void> {
  const apiKey  = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return;

  const digits = phone.replace(/\D/g, "");
  const normalised = digits.startsWith("233") ? `+${digits}` : digits.startsWith("0") ? `+233${digits.slice(1)}` : `+${digits}`;

  const body = new URLSearchParams({ username, to: normalised, message });
  if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);

  await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  }).catch(() => {});
}

export function orderConfirmedSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data has been delivered to ${phone}. Order ref: ${shortRef}. Thank you for using Elite Data! www.elitedata1.com`;
}

export function orderProcessingSMS(name: string, network: string, size: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data order is confirmed and being processed. Track at www.elitedata1.com/track?ref=${shortRef} - Elite Data`;
}
