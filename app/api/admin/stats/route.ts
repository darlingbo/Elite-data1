import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ordersRes, agentsRes, totalsRes] = await Promise.all([
    supabase.from("orders")
      .select("status, amount, cost_price, admin_commission, agent_commission, agent_id, created_at, network, bundle_size, phone, reference, customer_name, refund_phone")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("agents").select("id, name, email, phone, whatsapp, business_name, referral_code, status, agent_type, plan, commission_balance, wallet_balance, total_sales, total_revenue, created_at, registration_ref, application_answers, ai_screening_decision, ai_screening_reason, ai_screening_score, ai_screening_confidence, ai_screened_at, approved_via"),
    supabase.rpc("admin_dashboard_order_totals"),
  ]);

  if (ordersRes.error) {
    console.error("[stats] orders query failed:", ordersRes.error.message, ordersRes.error.code);
    return Response.json({ error: "DB error: " + ordersRes.error.message }, { status: 500 });
  }
  if (totalsRes.error) {
    return Response.json({ error: "DB error: " + totalsRes.error.message }, { status: 500 });
  }

  type AgentRow = { id: string; name: string; email: string; phone: string; whatsapp: string; business_name: string; referral_code: string; status: string; agent_type?: string; plan?: string | null; commission_balance: number; wallet_balance: number; total_sales: number; total_revenue: number; created_at: string; registration_ref?: string | null };
  type OrderRow = { status: string; amount: number; cost_price: number; admin_commission: number; agent_commission: number; agent_id: string | null; created_at: string; network: string; bundle_size: string; phone: string; reference: string; customer_name: string; refund_phone: string | null; agent_name: string | null; agent_code: string | null };

  const agents = (agentsRes.data ?? []) as AgentRow[];
  const agentMap = new Map(agents.map(a => [a.id, { name: a.name, referral_code: a.referral_code }]));

  const orders: OrderRow[] = (ordersRes.data ?? []).map((o) => {
    const raw = o as Omit<OrderRow, "agent_name" | "agent_code">;
    const agentInfo = raw.agent_id ? agentMap.get(raw.agent_id) : null;
    return { ...raw, agent_name: agentInfo?.name ?? null, agent_code: agentInfo?.referral_code ?? null };
  });

  const totals = totalsRes.data as {
    total: number; completed: number; processing: number; pending: number;
    failed: number; pendingApproval: number; revenue: number; cost: number;
    adminProfit: number; agentCommissions: number;
  };

  return Response.json({
    orders: {
      all: orders,
      total: Number(totals.total),
      completed: Number(totals.completed),
      processing: Number(totals.processing),
      pending: Number(totals.pending),
      failed: Number(totals.failed),
      pendingApproval: Number(totals.pendingApproval),
    },
    revenue: { total: Number(totals.revenue), cost: Number(totals.cost) },
    profit: {
      admin: Number(totals.adminProfit),
      agentCommissions: Number(totals.agentCommissions),
      gross: Number(totals.revenue) - Number(totals.cost),
    },
    agents: {
      all: agents,
      total: agents.length,
      pending: agents.filter((a: { status: string }) => a.status === "pending").length,
      approved: agents.filter((a: { status: string }) => a.status === "approved").length,
      rejected: agents.filter((a: { status: string }) => a.status === "rejected").length,
    },
  });
}
