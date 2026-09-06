import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { sendVoucherSMS } from "@/lib/sms";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { phone?: unknown };
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const digits = phone.replace(/\D/g, "");
  if (!/^(?:0\d{9}|233\d{9})$/.test(digits)) {
    return Response.json({ error: "Enter a valid Ghana phone number." }, { status: 400 });
  }

  const testReference = `VOUCHER-SMS-TEST-${randomUUID()}`;
  const result = await sendVoucherSMS(
    phone,
    "EliteData voucher SMS test. Sender: ELITEVCHIR. This is only a test; no voucher or order was created.",
    testReference,
  );

  if (!result.ok) {
    return Response.json(
      { error: result.message, providerStatus: result.status },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  return Response.json({
    success: true,
    message: "MessagePilot accepted the voucher test SMS.",
    sender: process.env.MESSAGEPILOT_VOUCHER_SENDER_ID ?? null,
  });
}
