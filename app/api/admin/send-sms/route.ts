import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { sendCustomerSMS } from "@/lib/sms";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { phone, message } = await request.json() as { phone: string; message: string };
  if (!phone || !message) return Response.json({ error: "Phone and message are required" }, { status: 400 });
  if (message.length > 500) return Response.json({ error: "Message too long (max 500 chars)" }, { status: 400 });

  const result = await sendCustomerSMS(phone, message);
  if (!result.ok) {
    console.error("[admin/send-sms] provider rejected message", {
      status: result.status,
      providerMessage: result.message,
    });
    return Response.json(
      { error: result.message, providerStatus: result.status },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }
  return Response.json({ success: true, recipients: result.recipients });
}
