import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendSwiftAlert } from "@/lib/telegram";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

const METHOD_TO_BANK: Record<string, string> = {
  "MTN MoMo":    "MTN",
  "Telecel Cash": "VDF",
  "AirtelTigo":  "ATL",
};

async function paystackPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: txns } = await supabase
    .from("agent_wallet_transactions")
    .select("id, agent_id, type, amount, description, created_at, status")
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false });

  const { data: agents } = await supabase.from("agents").select("id, name, referral_code, phone");
  const agentMap = new Map((agents ?? []).map(a => [a.id, a]));

  const rows = (txns ?? []).map(t => ({
    ...t,
    agent: agentMap.get(t.agent_id) ?? null,
    status: t.status ?? "pending",
  }));

  const pending  = rows.filter(r => r.status === "pending").length;
  const approved = rows.filter(r => r.status === "approved").length;
  const rejected = rows.filter(r => r.status === "rejected").length;
  const totalGhc = rows.filter(r => r.status === "approved").reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  return Response.json({ withdrawals: rows, pending, approved, rejected, totalGhc });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status } = await req.json();
  if (!id || !["approved", "rejected"].includes(status)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  if (status === "rejected") {
    const { data: txnToReject } = await supabase
      .from("agent_wallet_transactions")
      .select("agent_id, amount, status")
      .eq("id", id)
      .single();

    if (!txnToReject) return Response.json({ error: "Transaction not found." }, { status: 404 });
    if (txnToReject.status !== "pending") return Response.json({ error: "Already processed." }, { status: 400 });

    // Refund the balance that was reserved at request time
    const refundAmt = Math.abs(Number(txnToReject.amount));
    const { data: agentToRefund } = await supabase
      .from("agents")
      .select("commission_balance, agent_type")
      .eq("id", txnToReject.agent_id)
      .maybeSingle();
    if (agentToRefund) {
      await supabase.from("agents")
        .update({ commission_balance: parseFloat((Number(agentToRefund.commission_balance ?? 0) + refundAmt).toFixed(2)) })
        .eq("id", txnToReject.agent_id);
    }

    const { error } = await supabase
      .from("agent_wallet_transactions")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    sendSwiftAlert(`❌ WITHDRAWAL REJECTED — GH₵${refundAmt.toFixed(2)} refunded to agent balance.`).catch(() => {});
    return Response.json({ success: true });
  }

  // ── APPROVED: fire the Paystack transfer now ──────────────────────────────
  const { data: txn } = await supabase
    .from("agent_wallet_transactions")
    .select("agent_id, amount, description, status")
    .eq("id", id)
    .single();

  if (!txn) return Response.json({ error: "Transaction not found." }, { status: 404 });
  if (txn.status === "approved") return Response.json({ error: "Already approved." }, { status: 400 });

  const amt = Math.abs(Number(txn.amount));

  // Parse account number and method from description
  // description format: "Withdrawal via {method} to {accountNumber} ({accountName})"
  const descMatch = txn.description?.match(/via (.+?) to (\S+)\s+\((.+?)\)/);
  const method      = descMatch?.[1] ?? "";
  const accountNumber = descMatch?.[2] ?? "";
  const accountName   = descMatch?.[3] ?? "";

  const bankCode = METHOD_TO_BANK[method];
  if (!bankCode) {
    return Response.json({ error: `Cannot parse payment method: "${method}"` }, { status: 400 });
  }

  // 1. Create Paystack recipient
  let recipientCode: string;
  try {
    const r = await paystackPost("/transferrecipient", {
      type: "mobile_money",
      name: accountName,
      account_number: accountNumber.replace(/\s/g, ""),
      bank_code: bankCode,
      currency: "GHS",
    });
    if (!r.status) return Response.json({ error: `Recipient failed: ${r.message}` }, { status: 502 });
    recipientCode = (r.data as Record<string, unknown>)?.recipient_code as string;
    if (!recipientCode) throw new Error("No recipient_code");
  } catch (err) {
    return Response.json({ error: `Recipient error: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  // 2. Initiate transfer
  let transferCode: string | undefined;
  let transferStatus: string | undefined;
  try {
    const t = await paystackPost("/transfer", {
      source: "balance",
      amount: Math.round(amt * 100),
      recipient: recipientCode,
      reason: `EliteData withdrawal — ${txn.description}`,
      currency: "GHS",
    });
    if (!t.status) {
      const msg = String(t.message ?? "");
      if (msg.toLowerCase().includes("otp")) {
        return Response.json({ error: "Disable transfer OTP in Paystack dashboard (Settings → Transfers → Disable OTP)." }, { status: 503 });
      }
      return Response.json({ error: `Transfer failed: ${msg}` }, { status: 502 });
    }
    const td = t.data as Record<string, unknown>;
    transferCode   = td?.transfer_code as string | undefined;
    transferStatus = td?.status as string | undefined;
  } catch (err) {
    return Response.json({ error: `Transfer error: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  // Balance was already deducted when the agent submitted the withdrawal request.
  // No balance change needed here — just mark approved and fire the transfer.

  // 3. Mark approved
  await supabase.from("agent_wallet_transactions").update({ status: "approved" }).eq("id", id);

  sendSwiftAlert(
    `✅ WITHDRAWAL APPROVED & SENT\n` +
    `💰 GH₵${amt.toFixed(2)} → ${accountNumber} (${accountName})\n` +
    `🏦 Paystack: ${transferCode ?? "—"} [${transferStatus ?? "pending"}]`
  ).catch(() => {});

  return Response.json({ success: true, transferCode, status: transferStatus });
}
