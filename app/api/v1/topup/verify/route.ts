import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { sendWalletTopupAlert, tgEscape } from "@/lib/telegram";
import { formatCurrency, fromMinorUnits, roundCurrency } from "@/lib/finance";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });

  const { reference } = body as Record<string, unknown>;
  if (!reference || typeof reference !== "string") {
    return NextResponse.json({ success: false, error: "reference is required." }, { status: 400 });
  }

  // Idempotency — already credited?
  const { data: existing } = await supabase
    .from("api_wallet_transactions")
    .select("id")
    .eq("reference", reference)
    .eq("type", "credit")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: false, error: "This payment reference has already been applied." }, { status: 409 });
  }

  // Verify with Paystack
  let psData: Record<string, unknown> = {};
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    psData = await res.json();
  } catch (e) {
    return NextResponse.json({ success: false, error: `Paystack verification failed: ${String(e)}` }, { status: 502 });
  }

  const txn = (psData.data as Record<string, unknown>) ?? {};
  if (psData.status !== true || txn.status !== "success") {
    return NextResponse.json({ success: false, error: "Payment not confirmed by Paystack. Make sure the payment is complete." }, { status: 400 });
  }

  // Confirm the payment belongs to this API key
  const meta = (txn.metadata as Record<string, unknown>) ?? {};
  if (meta.api_key_id && meta.api_key_id !== auth.keyId) {
    return NextResponse.json({ success: false, error: "This payment was not initiated for your API key." }, { status: 403 });
  }

  const amountPesewas = Number(txn.amount ?? 0);
  const amountGhc = fromMinorUnits(amountPesewas);
  if (amountGhc <= 0) {
    return NextResponse.json({ success: false, error: "Invalid payment amount." }, { status: 400 });
  }

  const { data: creditedBalance, error: updateErr } = await supabase.rpc("credit_api_wallet", {
    p_api_key_id: auth.keyId,
    p_reference: reference,
    p_amount: amountGhc,
    p_description: "Paystack API-wallet top-up",
  });
  if (updateErr || creditedBalance == null) {
    return NextResponse.json({ success: false, error: "Failed to credit wallet. Please contact support with your reference." }, { status: 500 });
  }
  const newBalance = roundCurrency(Number(creditedBalance));

  await sendWalletTopupAlert(
    `💳 <b>API WALLET TOP-UP</b>\n\n` +
    `👤 Account: <b>${tgEscape(auth.name)}</b>\n` +
    `💵 Amount: <b>${formatCurrency(amountGhc)}</b>\n` +
    `💰 New balance: <b>${formatCurrency(newBalance)}</b>\n` +
    `📎 Paystack ref: <code>${tgEscape(reference)}</code>\n` +
    `✅ Purpose: Developer API wallet funding`,
  ).catch(() => {});

  return NextResponse.json({
    success: true,
    amount_credited: amountGhc,
    new_balance: newBalance,
    currency: "GHS",
    message: `${formatCurrency(amountGhc)} has been credited to your wallet.`,
  });
}
