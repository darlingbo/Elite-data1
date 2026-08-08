import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAgentSession } from "@/lib/agentAuth";
import { rateLimitDb } from "@/lib/rate-limit";
import { sendWalletTopupAlert, tgEscape } from "@/lib/telegram";
import { formatCurrency, roundCurrency } from "@/lib/finance";

// POST — verify Paystack topup and credit agent wallet
export async function POST(request: NextRequest) {
  const body = await request.json() as { agentId: string; paystackRef: string };
  const { agentId, paystackRef } = body;

  if (!agentId || !paystackRef) return Response.json({ error: "agentId and paystackRef required" }, { status: 400 });
  const auth = requireAgentSession(request, agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (await rateLimitDb(`agent-wallet-topup:${agentId}`, 10, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many wallet requests. Try again later." }, { status: 429 });
  }

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

  const transaction = psData.data as Record<string, unknown>;
  const metadata = (transaction?.metadata ?? {}) as Record<string, unknown>;
  if (metadata.purpose !== "agent_wallet_topup" || metadata.agent_id !== agentId) {
    return Response.json({ error: "Payment does not belong to this agent wallet." }, { status: 403 });
  }

  const amountKobo = Number(transaction?.amount ?? 0);
  const amountGhc = roundCurrency(amountKobo / 100);
  if (amountGhc <= 0) return Response.json({ error: "Invalid payment amount." }, { status: 400 });

  const { error } = await supabase.rpc("credit_agent_wallet_topup", {
    p_agent_id: agentId,
    p_reference: paystackRef,
    p_amount: amountGhc,
  });
  if (error?.code === "23505") {
    return Response.json({ error: "This payment has already been applied." }, { status: 409 });
  }
  if (error) return Response.json({ error: "Could not credit the wallet." }, { status: 500 });

  const { data: agent } = await supabase.from("agents").select("name, referral_code").eq("id", agentId).maybeSingle();
  await sendWalletTopupAlert(
    `💳 <b>WALLET TOP-UP</b>\n\n` +
    `👤 Agent: <b>${tgEscape(agent?.name ?? "Agent")}</b>\n` +
    `🔗 Agent code: <code>${tgEscape((agent?.referral_code ?? "—").toUpperCase())}</code>\n` +
    `💵 Amount: <b>${formatCurrency(amountGhc)}</b>\n` +
    `📎 Paystack ref: <code>${tgEscape(paystackRef)}</code>\n` +
    `✅ Purpose: Agent wallet funding\n\n` +
    `<b>${tgEscape(agent?.name ?? "This agent")} topped up their wallet with ${formatCurrency(amountGhc)}.</b>`
  ).catch(() => {});

  return Response.json({ success: true, amount: amountGhc });
}
