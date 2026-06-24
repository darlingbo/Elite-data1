import { NextRequest } from "next/server";
import { cookies } from "next/headers";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phones, message } = await req.json() as { phones: string[]; message: string };

  if (!phones?.length || !message?.trim()) {
    return Response.json({ error: "phones and message are required." }, { status: 400 });
  }

  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  const senderId = process.env.AT_SENDER_ID ?? "";

  if (!apiKey || !username) {
    return Response.json({ error: "SMS not configured. Add AT_API_KEY and AT_USERNAME to Netlify environment variables." }, { status: 500 });
  }

  // Normalise Ghana numbers: 024XXXXXXX → +233XXXXXXXX
  const normalised = phones.map(p => {
    const digits = p.replace(/\D/g, "");
    if (digits.startsWith("233")) return `+${digits}`;
    if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
    return `+${digits}`;
  }).join(",");

  const body = new URLSearchParams({
    username,
    to: normalised,
    message: message.trim(),
    ...(senderId ? { from: senderId } : {}),
  });

  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      "apiKey": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json({ error: data.SMSMessageData?.Message ?? "SMS send failed" }, { status: 500 });
  }

  const recipients = data.SMSMessageData?.Recipients ?? [];
  const failed = recipients.filter((r: { status: string }) => r.status !== "Success");

  if (failed.length === recipients.length && recipients.length > 0) {
    return Response.json({ error: `All messages failed: ${failed[0]?.status}` }, { status: 500 });
  }

  return Response.json({
    success: true,
    sent: recipients.filter((r: { status: string }) => r.status === "Success").length,
    failed: failed.length,
    response: data,
  });
}
