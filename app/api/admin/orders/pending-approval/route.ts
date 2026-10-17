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
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

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
    const isYebeck = /^(?:ybk|yebeck)-/i.test(order.reference) ||
      /^(?:ybk|yebeck)-/i.test(String(order.paystack_reference ?? ""));
    if (!order.paystack_reference && !order.reference.startsWith("AGTWALLET-") && !isYebeck) {
      riskFlags.push("Payment reference missing");
    }

    return {
      ...order,
      queue_position: index + 1,
      risk_flags: riskFlags,
    };
  });

  return Response.json({ orders, count: orders.length });
}
