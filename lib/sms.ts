/**
 * Send SMS via Arkesel (Ghana-based SMS provider — arkesel.com).
 * Falls back to Africa's Talking if AT credentials are present instead.
 * Fire-and-forget safe — never throws, always resolves.
 */
function normaliseGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendCustomerSMS(phone: string, message: string): Promise<void> {
  const normalised = normaliseGhanaPhone(phone);

  // Arkesel (primary)
  const arkeselKey = process.env.ARKESEL_API_KEY;
  if (arkeselKey) {
    await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": arkeselKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender:     process.env.ARKESEL_SENDER_ID ?? "EliteData",
        message,
        recipients: [normalised],
      }),
    }).catch(() => {});
    return;
  }

  // Africa's Talking (fallback if AT credentials exist)
  const atKey      = process.env.AT_API_KEY;
  const atUsername = process.env.AT_USERNAME;
  if (atKey && atUsername) {
    const body = new URLSearchParams({ username: atUsername, to: normalised, message });
    if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);
    await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { apiKey: atKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    }).catch(() => {});
  }
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
