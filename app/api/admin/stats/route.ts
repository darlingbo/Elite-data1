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
    supabase.from("orders").select("status, amount, cost_price, admin_commission, agent_commission, agent_id, created_at, network, bundle_size, phone, reference, customer_name"),
    supabase.from("agents").select("id, name, email, phone, whatsapp, business_name, referral_code, status, agent_type, commission_balance, total_sales, total_revenue, created_at"),
  ]);

  const orders = ordersRes.data ?? [];
  const agents = agentsRes.data ?? [];

  const totalRevenue = orders.reduce((s: number, o: { amount: number }) => s + (o.amount ?? 0), 0);
  const totalCost = orders.reduce((s: number, o: { cost_price: number }) => s + (o.cost_price ?? 0), 0);
  const adminProfit = orders.reduce((s: number, o: { admin_commission: number }) => s + (o.admin_commission ?? 0), 0);
  const agentCommissions = orders.reduce((s: number, o: { agent_commission: number }) => s + (Number(o.agent_commission) ?? 0), 0);

  const byStatus = orders.reduce((acc: Record<string, number>, o: { status: string }) => {
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
