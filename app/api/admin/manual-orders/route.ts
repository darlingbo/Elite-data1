import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { bundles, networkApiName } from "@/lib/bundles";
import { sendAdminAlert, sendAgentNotification } from "@/lib/telegram";
import { inventorPurchase } from "@/lib/inventor";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

async function deliverBundle(phone: string, network: string, sizeGB: number, reference: string) {
  const apiNetwork = networkApiName[network as keyof typeof networkApiName] ?? network.toUpperCase();
  const { ok, body } = await inventorPurchase(apiNetwork, phone, sizeGB, reference, 20_000);
  const log = ok
    ? "Accepted by Inventor"
    : String((body.error as string) ?? (body.message as string) ?? JSON.stringify(body)).slice(0, 200);
  return { ok, log };
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("manual_orders").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ orders: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, action, note } = await req.json() as {
    id: string;
    action: "approve" | "reject";
    note?: string;
  };
  if (!id || !action) return Response.json({ error: "id and action required" }, { status: 400 });

  if (action === "reject") {
    const { data: order } = await supabase.from("manual_orders")
      .select("agent_id, customer_phone, network, bundle_size").eq("id", id).maybeSingle();
    const { data: rejected, error } = await supabase.from("manual_orders")
      .update({ status: "rejected", admin_note: note ?? "", updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending").select("id").maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!rejected) return Response.json({ error: "Order is already being processed" }, { status: 409 });
    if (order?.agent_id) {
      const { data: agent } = await supabase.from("agents")
        .select("telegram_chat_id").eq("id", order.agent_id).maybeSingle();
      if (agent?.telegram_chat_id) {
        await sendAgentNotification(agent.telegram_chat_id,
          `Manual order rejected: ${order.network.toUpperCase()} ${order.bundle_size} to ${order.customer_phone}. ${note ?? ""}`
        ).catch(() => {});
      }
    }
    return Response.json({ success: true });
  }

  if (action !== "approve") return Response.json({ error: "Invalid action" }, { status: 400 });

  // The conditional update is a lock: two clicks cannot deliver the same order twice.
  const { data: order, error: claimError } = await supabase.from("manual_orders")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select("*").maybeSingle();
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
  if (!order) return Response.json({ error: "Order is already being processed or completed" }, { status: 409 });

  const bundle = bundles.find((candidate) => candidate.id === order.bundle_id);
  if (!bundle) {
    await supabase.from("manual_orders").update({ status: "pending" })
      .eq("id", id).eq("status", "processing");
    return Response.json({ error: "Bundle not found in system" }, { status: 400 });
  }

  const reference = `MNL-${id.slice(0, 8).toUpperCase()}`;
  const { ok, log } = await deliverBundle(order.customer_phone, order.network, bundle.sizeGB, reference);
  if (!ok) {
    // A timeout is ambiguous. Never retry automatically; reconcile with the provider first.
    await supabase.from("manual_orders").update({
      status: "delivery_unknown",
      admin_note: `Provider result needs reconciliation: ${log}`,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "processing");
    await sendAdminAlert(`Manual order ${reference} needs delivery reconciliation: ${log}`).catch(() => {});
    return Response.json({ error: "Provider result is uncertain. Check provider before retrying.", reference }, { status: 502 });
  }

  const { error: orderError } = await supabase.from("orders").insert({
    reference,
    customer_name: `Agent: ${order.agent_name}`,
    phone: order.customer_phone,
    network: order.network,
    bundle_size: `${order.network.toUpperCase()} ${order.bundle_size}`,
    amount: order.amount_paid,
    cost_price: order.cost_price,
    agent_commission: order.agent_commission,
    admin_commission: order.admin_profit,
    agent_id: order.agent_id ?? null,
    status: "processing",
    created_at: new Date().toISOString(),
  });
  if (orderError) {
    await sendAdminAlert(`Delivered ${reference}, but accounting record failed: ${orderError.message}. Do not redeliver.`).catch(() => {});
    return Response.json({ error: "Delivered, but accounting needs reconciliation. Do not retry.", reference }, { status: 500 });
  }

  const { error: accountingError } = await supabase.rpc("admin_complete_order", { p_reference: reference });
  if (accountingError) {
    await sendAdminAlert(`Delivered ${reference}, but atomic accounting failed: ${accountingError.message}. Do not redeliver.`).catch(() => {});
    return Response.json({ error: "Delivered, but accounting needs reconciliation. Do not retry.", reference }, { status: 500 });
  }

  await supabase.from("manual_orders").update({
    status: "approved",
    admin_note: note ?? "",
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "processing");

  if (order.agent_id) {
    const { data: agent } = await supabase.from("agents")
      .select("telegram_chat_id").eq("id", order.agent_id).maybeSingle();
    if (agent?.telegram_chat_id) {
      await sendAgentNotification(agent.telegram_chat_id,
        `Manual order delivered and commission credited. Ref: ${reference}`
      ).catch(() => {});
    }
  }
  await sendAdminAlert(`Manual order delivered and accounted. Ref: ${reference}`).catch(() => {});
  return Response.json({ success: true, reference });
}
