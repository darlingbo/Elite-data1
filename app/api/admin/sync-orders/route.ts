import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

const networkApiMap: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
};

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

async function retryDelivery(order: {
  reference: string;
  phone: string;
  network: string;
  bundle_size_gb: number;
  bundle_size: string;
}): Promise<boolean> {
  try {
    const retryRef = `${order.reference}-rs`;
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiMap[order.network] ?? order.network.toUpperCase(),
        Phone: order.phone,
        Datasize: order.bundle_size_gb,
        reference: retryRef,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return res.ok || body.success === true || body.status === "success" || body.status === "00";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const isCron = request.headers.get("x-cron-sync") === process.env.CRON_SECRET;
  if (!isCron && !(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Try full query with all columns; fall back if newer columns don't exist yet
  type OrderRow = { reference: string; status: string; phone: string; network: string; bundle_size: string; bundle_size_gb: number | null; created_at: string; agent_id: string | null; agent_commission: number | null; amount: number | null };

  let orders: OrderRow[] | null = null;
  const { data: full, error: fullErr } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, bundle_size_gb, created_at, agent_id, agent_commission, amount")
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
    orders = (basic ?? []).map(o => ({ ...o, bundle_size_gb: null, agent_commission: null, amount: null })) as OrderRow[];
  }

  if (!orders?.length) return Response.json({ updated: 0, retried: 0, checked: 0 });

  const chunks: OrderRow[][] = [];
  for (let i = 0; i < orders.length; i += 10) chunks.push(orders.slice(i, i + 10));

  let updated = 0, retried = 0;
  const retriedOrders: string[] = [];

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (order) => {
      const invStatus = await checkInventorOrder(order.reference);

      if (invStatus === "completed") {
        await supabase.from("orders").update({ status: "completed" }).eq("reference", order.reference);
        // Commission is already credited at approval time — do NOT credit again here
        updated++;
        return;
      }

      if (invStatus === "failed") {
        await supabase.from("orders").update({ status: "failed" }).eq("reference", order.reference);
        updated++;
        return;
      }

      // Still unresolved — retry if stuck >15 min
      const sizeGb = order.bundle_size_gb ?? (() => {
        const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
        return m ? parseFloat(m[1]) : 1;
      })();

      const isStuck = order.created_at < stuckCutoff;
      if (isStuck && order.phone && order.network && sizeGb) {
        const success = await retryDelivery({
          reference: order.reference,
          phone: order.phone,
          network: order.network,
          bundle_size_gb: Number(sizeGb),
          bundle_size: order.bundle_size,
        });
        if (success) {
          await supabase.from("orders").update({ status: "processing" }).eq("reference", order.reference);
          retried++;
          retriedOrders.push(`📱 ${order.phone} — ${(order.network ?? "").toUpperCase()} ${order.bundle_size}`);
        }
      }
    }));
  }

  if (retriedOrders.length > 0) {
    await sendAdminAlert(
      `🔁 AUTO-RETRY: ${retried} stuck order(s) resent\n\n${retriedOrders.join("\n")}`
    ).catch(() => {});
  }

  return Response.json({ updated, retried, checked: orders.length });
}
