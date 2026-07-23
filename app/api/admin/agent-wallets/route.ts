import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
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

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json({ error: "Idempotency-Key header required" }, { status: 400 });
  }

  const { data: newBalance, error: updateErr } = await supabase.rpc("admin_adjust_agent_wallet", {
    p_agent_id: agentId,
    p_delta: delta,
    p_idempotency_key: idempotencyKey,
    p_description: description || (type === "admin_credit" ? "Admin credit" : "Admin debit"),
  });
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 409 });

  return Response.json({ success: true, balance: newBalance });
}
