import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [ordersRes, agentsRes] = await Promise.all([
    supabase.from("orders").select("status, amount, cost_price, admin_commission, agent_commission, agent_id, created_at, network, bundle_size, phone, reference, customer_name, refund_phone"),
    supabase.from("agents").select("id, name, email, phone, whatsapp, business_name, referral_code, status, agent_type, commission_balance, wallet_balance, total_sales, total_revenue, created_at, registration_ref"),
  ]);

  type AgentRow = { id: string; name: string; email: string; phone: string; whatsapp: string; business_name: string; referral_code: string; status: string; agent_type?: string; commission_balance: number; wallet_balance: number; total_sales: number; total_revenue: number; created_at: string; registration_ref?: string | null };
  type OrderRow = { status: string; amount: number; cost_price: number; admin_commission: number; agent_commission: number; agent_id: string | null; created_at: string; network: string; bundle_size: string; phone: string; reference: string; customer_name: string; refund_phone: string | null; agent_name: string | null; agent_code: string | null };

  const agents = (agentsRes.data ?? []) as AgentRow[];
  const agentMap = new Map(agents.map(a => [a.id, { name: a.name, referral_code: a.referral_code }]));

  const orders: OrderRow[] = (ordersRes.data ?? []).map((o) => {
    const raw = o as Omit<OrderRow, "agent_name" | "agent_code">;
    const agentInfo = raw.agent_id ? agentMap.get(raw.agent_id) : null;
    return { ...raw, agent_name: agentInfo?.name ?? null, agent_code: agentInfo?.referral_code ?? null };
  });

  const totalRevenue = orders.reduce((s, o) => s + (o.amount ?? 0), 0);
  const totalCost = orders.reduce((s, o) => s + (o.cost_price ?? 0), 0);
  const adminProfit = orders.reduce((s, o) => s + (o.admin_commission ?? 0), 0);
  const agentCommissions = orders.reduce((s, o) => s + (Number(o.agent_commission) ?? 0), 0);

  const byStatus = orders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Response.json({
    orders: {
      all: orders,
      total: orders.length,
      completed: (byStatus["completed"] ?? 0) + (byStatus["COMPLETED"] ?? 0),
      processing: (byStatus["processing"] ?? 0) + (byStatus["PROCESSING"] ?? 0),
      pending: (byStatus["pending"] ?? 0) + (byStatus["PENDING"] ?? 0),
      failed: (byStatus["failed"] ?? 0) + (byStatus["FAILED"] ?? 0),
    },
    revenue: { total: totalRevenue, cost: totalCost },
    profit: { admin: adminProfit, agentCommissions, gross: totalRevenue - totalCost },
    agents: {
      all: agents,
      total: agents.length,
      pending: agents.filter((a: { status: string }) => a.status === "pending").length,
      approved: agents.filter((a: { status: string }) => a.status === "approved").length,
      rejected: agents.filter((a: { status: string }) => a.status === "rejected").length,
    },
  });
}
