import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";

const networkApiMap: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
};

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function checkInventorOrder(reference: string): Promise<"completed" | "processing" | "failed" | null> {
  try {
    const res = await fetch(
      `${process.env.INVENTOR_API_BASE_URL}/api/developer/order/${encodeURIComponent(reference)}`,
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
    const ok =
      res.ok ||
      body.success === true ||
      body.status === "success" ||
      body.status === "00";
    return ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Allow both admin cookie and internal cron calls
  const isCron = request.headers.get("x-cron-sync") === process.env.CRON_SECRET;
  if (!isCron && !(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes ago

  const { data: orders } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, bundle_size_gb, created_at")
    .in("status", ["pending", "processing"])
    .gte("created_at", cutoff48h);

  if (!orders?.length) return Response.json({ updated: 0, retried: 0, checked: 0 });

  const chunks: typeof orders[] = [];
  for (let i = 0; i < orders.length; i += 10) chunks.push(orders.slice(i, i + 10));

  let updated = 0;
  let retried = 0;
  const retriedOrders: string[] = [];

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (order) => {
      const invStatus = await checkInventorOrder(order.reference);

      if (invStatus === "completed") {
        await supabase.from("orders").update({ status: "completed" }).eq("reference", order.reference);
        updated++;
        return;
      }

      if (invStatus === "failed") {
        await supabase.from("orders").update({ status: "failed" }).eq("reference", order.reference);
        updated++;
        return;
      }

      // Still processing/pending — check if stuck for >15 minutes
      const isStuck = order.created_at < stuckCutoff;
      if (isStuck && order.phone && order.network && order.bundle_size_gb) {
        const success = await retryDelivery({
          reference: order.reference,
          phone: order.phone,
          network: order.network,
          bundle_size_gb: Number(order.bundle_size_gb),
          bundle_size: order.bundle_size,
        });
        if (success) {
          await supabase.from("orders").update({ status: "processing" }).eq("reference", order.reference);
          retried++;
          retriedOrders.push(
            `📱 ${order.phone} — ${(order.network ?? "").toUpperCase()} ${order.bundle_size} (ref: ${order.reference})`
          );
        }
      }
    }));
  }

  // Alert admin if any orders were auto-retried
  if (retriedOrders.length > 0) {
    await sendAdminAlert(
      `🔁 AUTO-RETRY: ${retried} stuck order(s) resent to Inventor\n\n${retriedOrders.join("\n")}`
    ).catch(() => {});
  }

  return Response.json({ updated, retried, checked: orders.length });
}
