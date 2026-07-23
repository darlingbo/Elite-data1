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
    .select("status, amount, cost_price, admin_commission, agent_commission, customer_name, phone, network, bundle_size, created_at, agent_id, reference, refund_phone, paystack_reference, approved_at, approved_via, provider_used")
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

  const orders = (ordersData ?? []).map((order, index, allOrders) => {
    const createdAt = new Date(order.created_at).getTime();
    const nearbyOrders = allOrders.filter(candidate =>
      candidate.reference !== order.reference &&
      candidate.phone === order.phone &&
      Math.abs(new Date(candidate.created_at).getTime() - createdAt) <= 10 * 60 * 1000
    );
    const riskFlags: string[] = [];

    if (nearbyOrders.length >= 2) riskFlags.push("High order frequency");
    if (nearbyOrders.some(candidate =>
      candidate.network === order.network && candidate.bundle_size === order.bundle_size
    )) riskFlags.push("Possible duplicate");
    if (Number(order.amount) <= Number(order.cost_price ?? 0)) riskFlags.push("No profit margin");
    if (!order.paystack_reference && !order.reference.startsWith("AGTWALLET-")) {
      riskFlags.push("Payment reference missing");
    }

    return {
      ...order,
      queue_position: index + 1,
      risk_flags: riskFlags,
      agent_name: order.agent_id ? (agentMap.get(order.agent_id)?.name ?? null) : null,
      agent_code: order.agent_id ? (agentMap.get(order.agent_id)?.referral_code ?? null) : null,
    };
  });

  return Response.json({ orders, count: orders.length });
}
