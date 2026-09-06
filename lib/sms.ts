/**
 * Send an SMS to a customer via Africa's Talking.
 * Normalises Ghana numbers (024XXXXXXX → +233XXXXXXXX).
 * Fire-and-forget safe — never throws, always resolves.
 */
export type SmsSendResult = {
  ok: boolean;
  status: number;
  message: string;
  recipients: Array<{ number?: string; status?: string; statusCode?: number; cost?: string }>;
};

export function africasTalkingBaseUrl(username = process.env.AT_USERNAME): string {
  return username === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";
}

export function africasTalkingUsernames(): string[] {
  const username = process.env.AT_USERNAME?.trim();
  return username ? [username] : [];
}

export function cleanAfricasTalkingApiKey(value = process.env.AT_API_KEY): string {
  let key = (value ?? "").trim();
  key = key.replace(/^AT_API_KEY\s*=\s*/i, "").trim();
  if (
    (key.startsWith("\"") && key.endsWith("\"")) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export function isAfricasTalkingAuthError(status: number, message: string): boolean {
  return status === 401 || /supplied authentication is invalid/i.test(message);
}

export async function sendCustomerSMS(phone: string, message: string): Promise<SmsSendResult> {
  const sender = process.env.AT_SENDER_ID_ENABLED === "1"
    ? process.env.AT_SENDER_ID
    : undefined;
  return sendSms(phone, message, sender);
}

function stableVoucherSmsIdempotencyKey(reference: string): string {
  const hex = createHash("sha256").update(`elite-voucher-sms:${reference}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Send voucher codes only through MessagePilot's dedicated Sender ID. */
export async function sendVoucherSMS(
  phone: string,
  message: string,
  orderReference: string,
): Promise<SmsSendResult> {
  const apiKey = process.env.MESSAGEPILOT_API_KEY?.trim();
  const senderIdId = process.env.MESSAGEPILOT_VOUCHER_SENDER_ID?.trim();
  if (!apiKey || !senderIdId) {
    return {
      ok: false,
      status: 503,
      message: "MessagePilot voucher SMS is not configured.",
      recipients: [],
    };
  }

  const recipient = normaliseGhanaPhone(phone);
  try {
    const response = await fetch("https://api.messagepilot.online/v1/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": stableVoucherSmsIdempotencyKey(orderReference),
      },
      body: JSON.stringify({ senderIdId, recipients: [recipient], body: message }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { payload = {}; }
    const providerMessage = String(payload.message ?? payload.error ?? (response.ok ? "Voucher SMS accepted." : `HTTP ${response.status}`));
    return {
      ok: response.ok,
      status: response.status,
      message: providerMessage,
      recipients: response.ok ? [{ number: recipient, status: "Success" }] : [],
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      message: error instanceof Error ? error.message : "MessagePilot request failed.",
      recipients: [],
    };
  }
}

async function sendSms(phone: string, message: string, sender?: string): Promise<SmsSendResult> {
  const apiKey = cleanAfricasTalkingApiKey();
  const usernames = africasTalkingUsernames();
  if (!apiKey || usernames.length === 0) {
    return { ok: false, status: 503, message: "AT_API_KEY or AT_USERNAME is not configured.", recipients: [] };
  }

  const normalised = normaliseGhanaPhone(phone);

  for (const username of usernames) {
    const body = new URLSearchParams({ username, to: normalised, message });
    if (sender) body.set("from", sender);

    try {
      const response = await fetch(`${africasTalkingBaseUrl(username)}/version1/messaging`, {
        method: "POST",
        headers: { apiKey: apiKey.trim(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await response.text();
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { payload = { raw }; }
      const smsData = (payload.SMSMessageData ?? {}) as Record<string, unknown>;
      const recipients = (smsData.Recipients ?? []) as SmsSendResult["recipients"];
      const providerMessage = String(
        smsData.Message ?? payload.errorMessage ?? payload.error ?? (raw || `HTTP ${response.status}`),
      );
      if (isAfricasTalkingAuthError(response.status, providerMessage)) continue;
      const accepted = response.ok && recipients.some(recipient => recipient.status === "Success");
      return { ok: accepted, status: response.status, message: providerMessage, recipients };
    } catch (error) {
      return { ok: false, status: 502, message: error instanceof Error ? error.message : String(error), recipients: [] };
    }
  }
  return {
    ok: false,
    status: 401,
    message: "Africa's Talking rejected the credentials. AT_USERNAME must be the exact application username that generated this API key (not the app name or account email).",
    recipients: [],
  };
}

export async function getSmsApprovalSettings(): Promise<{ enabled: boolean; adminPhone: string }> {
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", ["sms_approval_enabled", "sms_admin_phone"]);
  const settings = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    enabled: settings.get("sms_approval_enabled") === "1",
    adminPhone: settings.get("sms_admin_phone") ?? "",
  };
}

export async function sendAdminApprovalSMS(message: string): Promise<void> {
  const { enabled, adminPhone } = await getSmsApprovalSettings();
  if (!enabled || !adminPhone) return;

  const plain = message
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
  const references = [...message.matchAll(/<code>([^<]+)<\/code>/gi)].map((match) => match[1]);
  const reference = references.at(-1) ?? "";
  const command = reference
    ? `\nReply APPROVE ${reference} or REJECT ${reference}`
    : "";
  await sendSms(adminPhone, `${plain.slice(0, 300)}${command}`, process.env.AT_SMS_SHORTCODE);
}

/** Notify the configured admin only after a provider confirms delivery. */
export async function sendAdminDeliverySMS(order: {
  reference: string;
  phone: string;
  network: string;
  bundleSize: string;
}): Promise<void> {
  const { adminPhone } = await getSmsApprovalSettings();
  const destination = adminPhone || process.env.ADMIN_SMS_PHONE?.trim() || "";
  if (!destination) return;

  const shortRef = order.reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  await sendSms(
    destination,
    `DELIVERED: ${order.network.toUpperCase()} ${order.bundleSize} data was delivered to ${order.phone}. Ref: ${shortRef}.`,
    process.env.AT_SMS_SHORTCODE,
  );
}

export async function sendAdminCommandReplySMS(phone: string, message: string): Promise<void> {
  await sendSms(phone, message, process.env.AT_SMS_SHORTCODE);
}

export { normaliseGhanaPhone };

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

/**
 * True when an Inventor error means the recipient number is new / not yet on the
 * beneficiary list — a delivery delay, NOT a hard failure and NOT a refund case.
 */
export function isNotOnListError(message: string): boolean {
  return /beneficiar|not\s+verified|not\s+added|new\s+to\s+(the\s+)?system|not\s+eligible|not\s+on\s+(the\s+)?list/i.test(
    message || "",
  );
}

/** Sent once when an order lands in `not_on_list` — reassure, no refund, up to 72h. */
export function orderNotOnListSMS(name: string, network: string, size: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}, your ${network.toUpperCase()} ${size} order (Ref: ${shortRef}) has been received. This number is new to our system or not yet on our beneficiary list, so delivery can take up to 72 hours. No refund is needed — your data will be delivered. Thank you for your patience. — Elite Data`;
}

/** Sent once if a `not_on_list` order is still undelivered after 72h. No refund. */
export function orderNotOnListApologySMS(name: string, network: string, size: string, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}, we sincerely apologise — your ${network.toUpperCase()} ${size} order (Ref: ${shortRef}) is taking longer than expected. Our team is still working to deliver it to your number. Thank you for your patience. — Elite Data`;
}
import { supabase } from "@/lib/supabase";

function normaliseGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("233") ? `+${digits}` : digits.startsWith("0") ? `+233${digits.slice(1)}` : `+${digits}`;
}

export function orderRefundedSMS(name: string, amount: number, reference: string): string {
  const first = (name || "").split(" ")[0] || "Customer";
  const shortRef = reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  return `Hi ${first}, your GH₵${amount.toFixed(2)} refund for order ${shortRef} has been processed. Please allow your payment provider time to complete settlement. Thank you.`;
}
import { createHash } from "node:crypto";
