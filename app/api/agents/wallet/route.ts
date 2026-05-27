import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// POST — verify Paystack topup and credit agent wallet
export async function POST(request: NextRequest) {
  const body = await request.json() as { agentId: string; paystackRef: string };
  const { agentId, paystackRef } = body;

  if (!agentId || !paystackRef) return Response.json({ error: "agentId and paystackRef required" }, { status: 400 });

  // Check for duplicate topup
  const { data: existing } = await supabase
    .from("agent_wallet_transactions")
    .select("id")
    .eq("paystack_reference", paystackRef)
    .maybeSingle();
  if (existing) return Response.json({ error: "This payment has already been applied." }, { status: 409 });

  // Verify with Paystack
  let psData: Record<string, unknown> = {};
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    psData = await res.json();
  } catch (err) {
    return Response.json({ error: `Paystack verification failed: ${String(err)}` }, { status: 502 });
  }

  if (psData.status !== true || (psData.data as Record<string, unknown>)?.status !== "success") {
    return Response.json({ error: "Payment not confirmed by Paystack." }, { status: 400 });
  }

  const amountKobo = Number((psData.data as Record<string, unknown>)?.amount ?? 0);
  const amountGhc = parseFloat((amountKobo / 100).toFixed(2));
  if (amountGhc <= 0) return Response.json({ error: "Invalid payment amount." }, { status: 400 });

  // Credit wallet
  const { data: existing2 } = await supabase.from("agents").select("wallet_balance").eq("id", agentId).maybeSingle();
  const current = Number((existing2 as { wallet_balance?: number } | null)?.wallet_balance ?? 0);
  const { error: updateErr } = await supabase.from("agents").update({ wallet_balance: current + amountGhc }).eq("id", agentId);
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  // Log transaction
  await supabase.from("agent_wallet_transactions").insert({
    agent_id: agentId,
    type: "paystack_topup",
    amount: amountGhc,
    description: `Paystack top-up`,
    paystack_reference: paystackRef,
  });

  return Response.json({ success: true, amount: amountGhc });
}
