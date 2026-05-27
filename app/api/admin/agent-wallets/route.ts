import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

// GET — all agents with wallet info + recent wallet transactions
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [agentsRes, txRes] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name, referral_code, agent_type, commission_balance, wallet_balance, total_sales")
      .eq("status", "approved")
      .order("name"),
    supabase
      .from("agent_wallet_transactions")
      .select("id, agent_id, type, amount, description, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return Response.json({
    agents: agentsRes.data ?? [],
    transactions: txRes.data ?? [],
  });
}

// POST — credit or debit an agent's wallet
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    agentId: string;
    type: "admin_credit" | "admin_debit";
    amount: number;
    description?: string;
  };

  const { agentId, type, amount, description } = body;
  if (!agentId || !type || !amount) return Response.json({ error: "agentId, type and amount required" }, { status: 400 });

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) return Response.json({ error: "Amount must be positive" }, { status: 400 });
  if (!["admin_credit", "admin_debit"].includes(type)) return Response.json({ error: "Invalid type" }, { status: 400 });

  const delta = type === "admin_credit" ? amt : -amt;

  const { error: updateErr } = await supabase.rpc("adjust_agent_wallet", {
    p_agent_id: agentId,
    p_delta: delta,
  });

  // Fallback: direct update if RPC doesn't exist yet
  if (updateErr) {
    const { data: existing } = await supabase.from("agents").select("wallet_balance").eq("id", agentId).maybeSingle();
    const current = Number((existing as { wallet_balance?: number } | null)?.wallet_balance ?? 0);
    const newBal = Math.max(0, current + delta);
    const { error: directErr } = await supabase.from("agents").update({ wallet_balance: newBal }).eq("id", agentId);
    if (directErr) return Response.json({ error: directErr.message }, { status: 500 });
  }

  // Log the transaction
  await supabase.from("agent_wallet_transactions").insert({
    agent_id: agentId,
    type,
    amount: amt,
    description: description || (type === "admin_credit" ? "Admin credit" : "Admin debit"),
  });

  return Response.json({ success: true });
}
