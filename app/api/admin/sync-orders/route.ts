import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { sendAdminDeliverySMS } from "@/lib/sms";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

async function checkInventorOrder(reference: string): Promise<"completed" | "processing" | "failed" | null> {
  try {
    const res = await fetch(
      `${process.env.INVENTOR_API_BASE_URL}/api/developer/orders/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` }, signal: AbortSignal.timeout(8000) }
    );
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const invData = (body.data as Record<string, unknown>) ?? {};
    const invOrder = (invData.order as Record<string, unknown>) ?? (body.order as Record<string, unknown>) ?? invData;
    const raw = String(invOrder.status ?? invData.status ?? invData.delivery_status ?? body.status ?? "").toLowerCase();
    if (!raw) return null;
    if (raw.includes("complet") || raw.includes("success") || raw.includes("deliver") || raw === "00") return "completed";
    if (raw.includes("process") || raw.includes("progress") || raw.includes("dispatch")) return "processing";
    if (raw.includes("fail") || raw.includes("error") || raw.includes("cancel")) return "failed";
    return null;
  } catch {
    return null;
  }
}

async function creditAgent(agentId: string, commission: number, revenue: number) {
  if (!agentId || !commission) return;
  const { data: agent } = await supabase
    .from("agents")
    .select("commission_balance, total_sales, total_revenue")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return;
  await supabase.from("agents").update({
    commission_balance: (Number(agent.commission_balance) || 0) + commission,
    total_sales: (Number(agent.total_sales) || 0) + 1,
    total_revenue: (Number(agent.total_revenue) || 0) + revenue,
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
}

export async function POST(request: Request) {
  const isCron = request.headers.get("x-cron-sync") === process.env.CRON_SECRET;
  if (!isCron && !(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Try full query with all columns; fall back if newer columns don't exist yet
  type OrderRow = { reference: string; inventor_order_id: string | null; status: string; phone: string; network: string; bundle_size: string; bundle_size_gb: number | null; created_at: string; agent_id: string | null; agent_commission: number | null; amount: number | null };

  let orders: OrderRow[] | null = null;
  const { data: full, error: fullErr } = await supabase
    .from("orders")
    .select("reference, inventor_order_id, status, phone, network, bundle_size, bundle_size_gb, created_at, agent_id, agent_commission, amount")
    .in("status", ["pending", "processing"])
    .gte("created_at", cutoff48h);

  if (!fullErr) {
    orders = full as OrderRow[];
  } else {
    // Newer columns missing — fall back to basic columns
    const { data: basic } = await supabase
      .from("orders")
      .select("reference, status, phone, network, bundle_size, created_at, agent_id")
      .in("status", ["pending", "processing"])
      .gte("created_at", cutoff48h);
    orders = (basic ?? []).map(o => ({ ...o, inventor_order_id: null, bundle_size_gb: null, agent_commission: null, amount: null })) as OrderRow[];
  }

  if (!orders?.length) return Response.json({ updated: 0, retried: 0, checked: 0 });

  const chunks: OrderRow[][] = [];
  for (let i = 0; i < orders.length; i += 10) chunks.push(orders.slice(i, i + 10));

  let updated = 0;

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (order) => {
      const invStatus = await checkInventorOrder(order.inventor_order_id || order.reference);

      if (invStatus === "completed") {
        const { data: completedOrder } = await supabase
          .from("orders")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("reference", order.reference)
          .eq("status", order.status)
          .select("reference")
          .maybeSingle();
        if (!completedOrder) return;
        sendAdminDeliverySMS({
          reference: order.reference,
          phone: order.phone,
          network: order.network,
          bundleSize: order.bundle_size,
        }).catch(() => {});
        // Commission is already credited at approval time — do NOT credit again here
        updated++;
        return;
      }

      if (invStatus === "failed") {
        await supabase.from("orders").update({ status: "failed" }).eq("reference", order.reference);
        updated++;
        return;
      }

      // Unresolved orders stay untouched. Sync only reconciles provider status;
      // an explicit admin action is required to retry delivery.
    }));
  }

  return Response.json({ updated, retried: 0, checked: orders.length });
}
