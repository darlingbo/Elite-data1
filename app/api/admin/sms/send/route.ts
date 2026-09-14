import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { sendMessagePilotSms } from "@/lib/sms";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { phones, message } = await req.json() as { phones: string[]; message: string };
  if (!phones?.length || !message?.trim()) {
    return Response.json({ error: "phones and message are required." }, { status: 400 });
  }

  const result = await sendMessagePilotSms(phones, message.trim());
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 500 });
  }

  const sent = result.recipients.filter((r) => r.status === "Success").length;
  const failed = result.recipients.length - sent;

  return Response.json({
    success: true,
    accepted: sent,
    sent,
    failed,
    failReasons: [],
    deliveryPending: sent > 0,
    senderMode: "registered_sender_id",
  });
}
