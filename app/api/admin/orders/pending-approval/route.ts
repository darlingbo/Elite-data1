import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ordersData, error } = await supabase
    .from("orders")
    .select("status, amount, cost_price, admin_commission, agent_commission, customer_name, phone, network, bundle_size, created_at, agent_id, reference, refund_phone")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const agentIds = [...new Set((ordersData ?? []).map(o => o.agent_id).filter(Boolean))] as string[];
  const agentMap = new Map<string, { name: string; referral_code: string }>();
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, referral_code")
      .in("id", agentIds);
    for (const a of agents ?? []) agentMap.set(a.id, { name: a.name, referral_code: a.referral_code });
  }

  const orders = (ordersData ?? []).map(o => ({
    ...o,
    agent_name: o.agent_id ? (agentMap.get(o.agent_id)?.name ?? null) : null,
    agent_code: o.agent_id ? (agentMap.get(o.agent_id)?.referral_code ?? null) : null,
  }));

  return Response.json({ orders, count: orders.length });
}
