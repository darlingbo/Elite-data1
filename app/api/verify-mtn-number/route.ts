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

    // Any other Inventor response (beneficiary list, ineligible, unknown) — let the order through.
    // Admin handles delivery manually. Never block a paying customer at this step.
    return Response.json({
      verified: true,
      pendingManual: true,
      warning: `Your order will be placed and delivered within 24–48 hours. Our team will handle your delivery manually.`,
    });
  } catch {
    // Network / timeout error — allow through, purchase will be the hard gate
    return Response.json({ verified: true, skipped: true });
  }
}
