import { NextRequest } from "next/server";
import { rateLimitDb } from "@/lib/rate-limit";

// Submits the OTP / voucher code Paystack asks for on some Mobile Money charges
// (Telecel Cash, and some MTN MoMo flows return `status: "send_otp"` from /charge).
// The customer receives the code by SMS and enters it on the checkout page.
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`momo-otp:${ip}`, 10, 60_000)) {
    return Response.json({ error: "Too many attempts. Please wait a moment." }, { status: 429 });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return Response.json({ error: "Payment service is not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const reference = String(body.reference ?? "");
  const otp = String(body.otp ?? "").replace(/\D/g, "");
  if (!/^elite-momo-[A-Za-z0-9-]+$/.test(reference) || otp.length < 4 || otp.length > 8) {
    return Response.json({ error: "Enter the code sent to your phone." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.paystack.co/charge/submit_otp", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ otp, reference }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const data = (result.data ?? {}) as Record<string, unknown>;
    if (!response.ok || result.status !== true) {
      return Response.json({ error: String(result.message ?? "That code could not be verified.") }, { status: 502 });
    }
    return Response.json({
      success: true,
      status: String(data.status ?? "pending"),
      message: String(data.display_text ?? result.message ?? ""),
    });
  } catch {
    return Response.json({ error: "Could not reach the payment service. Please try again." }, { status: 502 });
  }
}
