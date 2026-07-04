import { NextRequest } from "next/server";
import { cookies } from "next/headers";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

function normalisePhones(phones: string[]): string[] {
  return phones.map(p => {
    const digits = p.replace(/\D/g, "");
    if (digits.startsWith("233")) return `+${digits}`;
    if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
    return `+${digits}`;
  });
}

async function sendViaArkesel(phones: string[], message: string): Promise<{ sent: number; failed: number; error?: string }> {
  const apiKey   = process.env.ARKESEL_API_KEY!;
  const senderId = process.env.ARKESEL_SENDER_ID ?? "EliteData";

  const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: senderId, message, recipients: phones }),
  });

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) return { sent: 0, failed: phones.length, error: String(data.message ?? "Arkesel error") };

  const status = String(data.status ?? "").toLowerCase();
  if (status === "success") return { sent: phones.length, failed: 0 };
  return { sent: 0, failed: phones.length, error: String(data.message ?? "Unknown error") };
}

async function sendViaAT(phones: string[], message: string): Promise<{ sent: number; failed: number; error?: string }> {
  const apiKey   = process.env.AT_API_KEY!;
  const username = process.env.AT_USERNAME!;
  const senderId = process.env.AT_SENDER_ID ?? "";

  const body = new URLSearchParams({
    username,
    to: phones.join(","),
    message: message.trim(),
    ...(senderId ? { from: senderId } : {}),
  });

  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });

  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

  if (!res.ok) return { sent: 0, failed: phones.length, error: (data.SMSMessageData as Record<string,string>)?.Message ?? rawText };

  const recipients = (data.SMSMessageData as Record<string, unknown>)?.Recipients as { status: string }[] ?? [];
  const sent   = recipients.filter(r => r.status === "Success").length;
  const failed = recipients.length - sent;
  return { sent, failed };
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { phones, message } = await req.json() as { phones: string[]; message: string };
  if (!phones?.length || !message?.trim()) {
    return Response.json({ error: "phones and message are required." }, { status: 400 });
  }

  const normalised = normalisePhones(phones);

  const hasArkesel = !!process.env.ARKESEL_API_KEY;
  const hasAT      = !!(process.env.AT_API_KEY && process.env.AT_USERNAME);

  if (!hasArkesel && !hasAT) {
    return Response.json({ error: "SMS not configured. Add ARKESEL_API_KEY or AT_API_KEY + AT_USERNAME to environment variables." }, { status: 500 });
  }

  try {
    const result = hasArkesel
      ? await sendViaArkesel(normalised, message.trim())
      : await sendViaAT(normalised, message.trim());

    if (result.error && result.sent === 0) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    return Response.json({ success: true, sent: result.sent, failed: result.failed });
  } catch (err) {
    return Response.json({ error: `SMS send failed: ${String(err)}` }, { status: 500 });
  }
}
