import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { sendCustomerSMS } from "@/lib/sms";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, message } = await request.json() as { phone: string; message: string };
  if (!phone || !message) return Response.json({ error: "Phone and message are required" }, { status: 400 });
  if (message.length > 500) return Response.json({ error: "Message too long (max 500 chars)" }, { status: 400 });

  await sendCustomerSMS(phone, message);
  return Response.json({ success: true });
}
