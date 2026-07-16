import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { inventorPurchase } from "@/lib/inventor";

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

  const networkKey = (order.network?.toLowerCase() ??
    (order.bundle_size?.toLowerCase().startsWith("mtn") ? "mtn" :
     order.bundle_size?.toLowerCase().startsWith("telecel") ? "telecel" :
     order.bundle_size?.toLowerCase().includes("airtel") ? "airteltigo" : "mtn")) as string;
  const network = networkApiName[networkKey] ?? networkKey.toUpperCase();
  const sizeGB = order.bundle_size_gb ?? (() => {
    const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
    return m ? parseFloat(m[1]) : 1;
  })();

  const { ok: inventorOk, body: inventorBody } = await inventorPurchase(network, order.phone, sizeGB, reference);
  const inventorLog = `Inventor response: ${JSON.stringify(inventorBody).slice(0, 300)}`;

  if (inventorOk) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", reference);
    try { await supabase.from("order_logs").insert({ reference, action: "retry_success", note: "Admin retry — Inventor accepted", details: { log: inventorLog } }); } catch { /* non-critical */ }
    await sendAdminAlert(`✅ RETRY SENT\nRef: ${reference}\nPhone: ${order.phone}\n${(order.network ?? "").toUpperCase()} ${order.bundle_size}\nStatus: PROCESSING`);
    return Response.json({ success: true, status: "processing" });
  }

  try { await supabase.from("order_logs").insert({ reference, action: "retry_failed", note: "Admin retry — Inventor rejected", details: { log: inventorLog } }); } catch { /* non-critical */ }
  await sendAdminAlert(`❌ RETRY FAILED\nRef: ${reference}\nPhone: ${order.phone}\n${inventorLog}`);
  return Response.json({ success: false, status: "failed", log: inventorLog }, { status: 502 });
}
