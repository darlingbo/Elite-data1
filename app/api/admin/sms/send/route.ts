import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { africasTalkingBaseUrl, africasTalkingUsernames, cleanAfricasTalkingApiKey, isAfricasTalkingAuthError } from "@/lib/sms";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

function normalizePhones(phones: string[]): string[] {
  return phones.map(p => {
    const digits = p.replace(/\D/g, "");
    if (digits.startsWith("233")) return `+${digits}`;
    if (digits.startsWith("0"))   return `+233${digits.slice(1)}`;
    return `+${digits}`;
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { phones, message } = await req.json() as { phones: string[]; message: string };
  if (!phones?.length || !message?.trim()) {
    return Response.json({ error: "phones and message are required." }, { status: 400 });
  }

  const apiKey = cleanAfricasTalkingApiKey();
  const usernames = africasTalkingUsernames();
  const senderId = process.env.AT_SENDER_ID_ENABLED === "1"
    ? (process.env.AT_SENDER_ID ?? "")
    : "";

  if (!apiKey || usernames.length === 0) {
    return Response.json({ error: "SMS not configured. Add AT_API_KEY and AT_USERNAME to environment variables." }, { status: 500 });
  }

  let username = usernames[0];
  let res: Response | null = null;
  let data: Record<string, unknown> = {};
  let rawText = "";
  for (const candidate of usernames) {
    username = candidate;
    const body = new URLSearchParams({
      username,
      to: normalizePhones(phones).join(","),
      message: message.trim(),
      ...(senderId ? { from: senderId } : {}),
    });
    try {
      res = await fetch(`${africasTalkingBaseUrl(username)}/version1/messaging`, {
        method: "POST",
        headers: { apiKey: apiKey.trim(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
      });
    } catch (err) {
      return Response.json({ error: `Network error: ${String(err)}` }, { status: 500 });
    }
    rawText = await res.text();
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
    const providerMessage = String(
      (data.SMSMessageData as Record<string, string> | undefined)?.Message ??
      data.errorMessage ??
      rawText,
    );
    if (isAfricasTalkingAuthError(res.status, providerMessage)) continue;
    break;
  }

  if (!res?.ok) {
    return Response.json({
      error: res?.status === 401
        ? "Africa's Talking rejected the credentials. Set AT_USERNAME to the exact application username that generated AT_API_KEY; both must come from the same live app."
        : ((data.SMSMessageData as Record<string, string>)?.Message ?? rawText),
    }, { status: 500 });
  }

  const recipients = (data.SMSMessageData as Record<string, unknown>)?.Recipients as { number: string; status: string; statusCode: number; cost: string }[] ?? [];
  const sent   = recipients.filter(r => r.status === "Success").length;
  const failed = recipients.length - sent;

  // Collect unique non-success statuses so the admin can diagnose delivery issues
  const failReasons = [...new Set(recipients.filter(r => r.status !== "Success").map(r => r.status))];

  return Response.json({
    success: true,
    accepted: sent,
    sent,
    failed,
    failReasons,
    username,
    isSandbox: username === "sandbox",
    deliveryPending: sent > 0,
    senderMode: senderId ? "registered_sender_id" : "provider_default",
  });
}
