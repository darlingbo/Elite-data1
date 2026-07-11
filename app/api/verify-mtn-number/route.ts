import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { phone } = await request.json().catch(() => ({}));
  if (!phone) return Response.json({ verified: false, error: "Phone number required." }, { status: 400 });

  const key  = process.env.INVENTOR_API_KEY;
  const base = process.env.INVENTOR_API_BASE_URL;

  // If Inventor isn't configured, allow through — purchase will handle it
  if (!key || !base) return Response.json({ verified: true, skipped: true });

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/developer/verify-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ phone: String(phone).replace(/\s/g, ""), is_ported_number: false }),
      signal: AbortSignal.timeout(10_000),
    });

    // 503 = Inventor verification service is down — let the purchase attempt proceed
    if (res.status === 503) return Response.json({ verified: true, skipped: true });

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const d = (data.data as Record<string, unknown>) ?? {};

    if (data.success && d.exists) {
      return Response.json({ verified: true });
    }

    // Number explicitly not on beneficiary list — allow order through, admin will handle manually
    const msg = String((data.message as string) ?? (data.error as string) ?? "");
    if (msg.includes("beneficiary")) {
      return Response.json({
        verified: true,
        pendingManual: true,
        warning: `Your order will be placed and delivered within 24–48 hours. Please contact admin to keep an eye on it for you.`,
      });
    }
    return Response.json({
      verified: false,
      error: "This MTN number could not be verified. Please check it and try again.",
    });
  } catch {
    // Network / timeout error — allow through, purchase will be the hard gate
    return Response.json({ verified: true, skipped: true });
  }
}
