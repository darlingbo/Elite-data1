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

  const apiKey = process.env.ARKESEL_API_KEY;
  const senderId = process.env.SMS_SENDER_ID ?? "EliteData";

  if (!apiKey) {
    return Response.json({ error: "SMS not configured. Add ARKESEL_API_KEY to environment variables." }, { status: 500 });
  }

  // Normalise Ghana numbers: 024XXXXXXX → 233XXXXXXXXX
  const normalised = phones.map(p => {
    const digits = p.replace(/\D/g, "");
    if (digits.startsWith("233")) return digits;
    if (digits.startsWith("0")) return "233" + digits.slice(1);
    return digits;
  });

  const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: senderId,
      message: message.trim(),
      recipients: normalised,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.status === "error") {
    return Response.json({ error: data.message ?? data.error ?? "SMS send failed" }, { status: 500 });
  }

  return Response.json({ success: true, sent: normalised.length, response: data });
}
