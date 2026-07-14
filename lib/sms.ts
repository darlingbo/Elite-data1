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

export function orderReceivedSMS(name: string, network: string, size: string, _phone: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data order (Ref: ${shortRef}) has been received. Delivery is in progress. Thank you for choosing Elite Data!`;
}

export function orderDeliveredSMS(name: string, network: string, size: string, _phone: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}! Your ${network.toUpperCase()} ${size} data has been delivered. Ref: ${shortRef}. Thank you for choosing Elite Data!`;
}

export function orderConfirmedSMS(name: string, network: string, size: string, phone: string, reference: string): string {
  return orderDeliveredSMS(name, network, size, phone, reference);
}

export function orderFailedSMS(name: string, network: string, size: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}, we're sorry — your ${network.toUpperCase()} ${size} data order (Ref: ${shortRef}) could not be delivered. You will receive a full refund within 24 hours. Contact us for help.`;
}
