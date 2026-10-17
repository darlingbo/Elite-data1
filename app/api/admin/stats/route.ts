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

  const [ordersRes, totalsRes] = await Promise.all([
    supabase.from("orders")
      .select("status, amount, cost_price, admin_commission, agent_commission, agent_id, created_at, completed_at, network, bundle_size, phone, reference, customer_name, refund_phone, not_on_list_at, refunded")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.rpc("admin_dashboard_order_totals"),
  ]);

  if (ordersRes.error) {
    console.error("[stats] orders query failed:", ordersRes.error.message, ordersRes.error.code);
    return Response.json({ error: "DB error: " + ordersRes.error.message }, { status: 500 });
  }
  if (totalsRes.error) {
    return Response.json({ error: "DB error: " + totalsRes.error.message }, { status: 500 });
  }

  type OrderRow = { status: string; amount: number; cost_price: number; admin_commission: number; agent_commission: number; agent_id: string | null; created_at: string; network: string; bundle_size: string; phone: string; reference: string; customer_name: string; refund_phone: string | null; agent_name: string | null; agent_code: string | null };

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];

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
  });
}
