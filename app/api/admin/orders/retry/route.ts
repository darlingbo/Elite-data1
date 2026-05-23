import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";

const networkApiName: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
};

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { reference } = await request.json();
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });

  // Load the order
  const { data: order } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, bundle_size_gb, phone, status, cost_price, agent_id, agent_commission, admin_commission")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  // Re-call Inventor
  let inventorBody: Record<string, unknown> = {};
  let inventorOk = false;
  let inventorHttpStatus = 0;
  try {
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: (() => {
          const net = order.network?.toLowerCase() ??
            (order.bundle_size?.toLowerCase().startsWith("mtn") ? "mtn" :
             order.bundle_size?.toLowerCase().startsWith("telecel") ? "telecel" :
             order.bundle_size?.toLowerCase().includes("airtel") ? "airteltigo" : null);
          return net ? (networkApiName[net] ?? net.toUpperCase()) : order.network;
        })(),
        Phone: order.phone,
        Datasize: order.bundle_size_gb ?? (() => {
          const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
          return m ? parseFloat(m[1]) : 1;
        })(),
        reference: order.reference,
      }),
    });
    inventorHttpStatus = invRes.status;
    inventorBody = await invRes.json().catch(() => ({}));
    // 409 = duplicate reference — check if the existing order is already completed
    const existingOrder = (inventorBody.existingOrder as Record<string, unknown>) ?? {};
    const existingStatus = String(existingOrder.status ?? "").toLowerCase();
    const duplicateCompleted = inventorHttpStatus === 409 && (existingStatus.includes("complet") || existingStatus === "00");

    inventorOk =
      invRes.ok ||
      inventorBody.success === true ||
      inventorBody.status === "success" ||
      inventorBody.status === "00" ||
      duplicateCompleted;
  } catch (err) {
    inventorBody = { error: String(err) };
  }

  const inventorLog = `Inventor HTTP ${inventorHttpStatus}: ${JSON.stringify(inventorBody).slice(0, 300)}`;

  const invData = (inventorBody.data as Record<string, unknown>) ?? {};
  const invOrderData = (invData.order as Record<string, unknown>) ?? {};
  const existingOrderData = (inventorBody.existingOrder as Record<string, unknown>) ?? {};
  const rawStatus = String(invOrderData.status ?? invData.status ?? existingOrderData.status ?? "").toLowerCase();

  const isProcessing =
    rawStatus.includes("process") || rawStatus.includes("progress") || rawStatus.includes("dispatch") || rawStatus.includes("pending");

  if (inventorOk && !isProcessing) {
    const orderId = (invOrderData.id as string) ?? (invData.id as string) ?? (existingOrderData.id as string) ?? null;
    await supabase.from("orders").update({ status: "completed", inventor_order_id: orderId }).eq("reference", reference);

    if (order.agent_id) {
      await supabase.rpc("increment_agent_stats", {
        p_agent_id: order.agent_id,
        p_commission: Number(order.agent_commission) || 0,
        p_revenue: (Number(order.cost_price) || 0) + (Number(order.agent_commission) || 0) + (Number(order.admin_commission) || 0),
      }).maybeSingle();
    }

    await sendAdminAlert(`✅ RETRY SUCCEEDED\nRef: ${reference}\nPhone: ${order.phone}\n${(order.network ?? "").toUpperCase()} ${order.bundle_size}\n${inventorLog}`);
    return Response.json({ success: true, status: "completed" });
  }

  if (isProcessing) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);
    await sendAdminAlert(`⏳ RETRY → PROCESSING\nRef: ${reference}\nPhone: ${order.phone}\n${inventorLog}`);
    return Response.json({ success: true, status: "processing" });
  }

  await sendAdminAlert(`❌ RETRY FAILED\nRef: ${reference}\nPhone: ${order.phone}\n${inventorLog}`);
  return Response.json({ success: false, status: "failed", log: inventorLog }, { status: 502 });
}
