import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { roundCurrency, toMinorUnits } from "@/lib/finance";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });

  const { amount, email } = body as Record<string, unknown>;

  if (!amount || isNaN(Number(amount)) || Number(amount) < 1) {
    return NextResponse.json({ success: false, error: "amount must be a number (minimum GH₵1)." }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "A valid email address is required for Paystack." }, { status: 400 });
  }

  const amountGhc = roundCurrency(Number(amount));
  const amountPesewas = toMinorUnits(amountGhc);

  // Initialize Paystack transaction
  let psRes: Response;
  try {
    psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
      body: JSON.stringify({
        email,
        amount: amountPesewas,
        currency: "GHS",
        metadata: {
          api_key_id: auth.keyId,
          api_key_name: auth.name,
          topup_type: "api_wallet",
        },
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.elitedata1.com"}/api/v1/topup/verify`,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: `Paystack request failed: ${String(e)}` }, { status: 502 });
  }

  const psData = await psRes.json().catch(() => ({})) as Record<string, unknown>;
  if (!psRes.ok || psData.status !== true) {
    return NextResponse.json({ success: false, error: (psData.message as string) || "Paystack initialization failed." }, { status: 502 });
  }

  const data = psData.data as Record<string, unknown>;
  return NextResponse.json({
    success: true,
    payment_url: data.authorization_url,
    reference: data.reference,
    amount: amountGhc,
    message: "Visit payment_url to complete your payment. Then call POST /api/v1/topup/verify with the reference to credit your wallet.",
  });
}
