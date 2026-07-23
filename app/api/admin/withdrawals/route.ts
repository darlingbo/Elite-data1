import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSwiftAlert } from "@/lib/telegram";
import { isAdmin } from "@/lib/adminAuth";

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: txns } = await supabase
    .from("agent_wallet_transactions")
    .select("id, agent_id, type, amount, description, created_at, status")
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false });

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, referral_code, phone");
  const agentMap = new Map((agents ?? []).map((agent) => [agent.id, agent]));

  const rows = (txns ?? []).map((transaction) => ({
    ...transaction,
    agent: agentMap.get(transaction.agent_id) ?? null,
    status: transaction.status ?? "pending",
  }));

  const pending = rows.filter((row) => row.status === "pending").length;
  const approved = rows.filter((row) => row.status === "approved").length;
  const rejected = rows.filter((row) => row.status === "rejected").length;
  const totalGhc = rows
    .filter((row) => row.status === "approved")
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);

  return Response.json({ withdrawals: rows, pending, approved, rejected, totalGhc });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, status } = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
  };
  if (!id || !["approved", "rejected"].includes(status ?? "")) {
    return Response.json({ error: "Invalid withdrawal action." }, { status: 400 });
  }

  if (status === "rejected") {
    const { data: rejected, error } = await supabase.rpc("reject_agent_withdrawal", {
      p_transaction_id: id,
    });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!rejected) {
      return Response.json({ error: "Already processed." }, { status: 400 });
    }

    sendSwiftAlert(
      `❌ WITHDRAWAL REJECTED — reserved funds returned to the agent's original balances.`
    ).catch(() => {});
    return Response.json({ success: true });
  }

  // Approval is record-only. The admin sends the Mobile Money separately,
  // then uses this action to mark the already-paid request as complete.
  const { data: transaction } = await supabase
    .from("agent_wallet_transactions")
    .select("amount, description, status")
    .eq("id", id)
    .single();

  if (!transaction) {
    return Response.json({ error: "Transaction not found." }, { status: 404 });
  }
  if (transaction.status !== "pending") {
    return Response.json({ error: "Already processed." }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("agent_wallet_transactions")
    .update({ status: "approved" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return Response.json({ error: "Already processed." }, { status: 409 });
  }

  const amount = Math.abs(Number(transaction.amount));
  sendSwiftAlert(
    `✅ WITHDRAWAL MARKED AS PAID MANUALLY\n` +
      `💰 GH₵${amount.toFixed(2)} — ${transaction.description}\n` +
      `No automatic Paystack transfer was initiated.`
  ).catch(() => {});

  return Response.json({
    success: true,
    status: "approved",
    paymentMode: "manual",
  });
}
