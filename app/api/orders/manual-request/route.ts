import { NextRequest } from "next/server";
import { sendSwiftAlert } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { supabase } from "@/lib/supabase";

async function upsertRefundLog(reference: string, patch: Record<string, unknown>) {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "refund_log")
    .maybeSingle();
  let existing: Record<string, unknown>[] = [];
  try { existing = JSON.parse(data?.value ?? "[]"); } catch { existing = []; }

  const idx = existing.findIndex(e => e.reference === reference || e.id === reference);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...patch, refund_submitted_at: new Date().toISOString() };
  } else {
    existing.push({ id: reference, reference, ...patch, saved_at: new Date().toISOString(), refund_submitted_at: new Date().toISOString() });
  }

  await supabase
    .from("system_settings")
    .upsert({ key: "refund_log", value: JSON.stringify(existing) }, { onConflict: "key" });
}

export async function POST(req: NextRequest) {
  const { reference, customerPhone, customerName, network, bundleSize, refundName, refundPhone } = await req.json();

  // Validate that the reference + phone actually exist in the orders table before accepting
  if (!reference || !customerPhone) {
    return Response.json({ error: "Reference and phone are required." }, { status: 400 });
  }

  const cleanPhone = String(customerPhone).replace(/\s/g, "");
  const cleanRef   = String(reference).trim();

  const { data: order } = await supabase
    .from("orders")
    .select("phone, status")
    .eq("reference", cleanRef)
    .maybeSingle();

  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  if ((order.phone ?? "").replace(/\s/g, "") !== cleanPhone) {
    return Response.json({ error: "Phone number does not match this order." }, { status: 403 });
  }

  if ((order.status ?? "").toLowerCase() === "completed") {
    return Response.json({ error: "This order was delivered successfully and is not eligible for a refund." }, { status: 400 });
  }

  if (!refundPhone) {
    return Response.json({ error: "MoMo number is required." }, { status: 400 });
  }

  // Merge refund details into the existing log entry (created at order time)
  upsertRefundLog(cleanRef, {
    customer_name: customerName ?? null,
    customer_phone: cleanPhone,
    network: network ?? null,
    bundle_size: bundleSize ?? null,
    refund_name: refundName ?? null,
    refund_phone: String(refundPhone).trim(),
  }).catch(() => {});

  // Also update orders table (best effort)
  supabase
    .from("orders")
    .update({ refund_phone: String(refundPhone).trim(), refund_network: null })
    .eq("reference", cleanRef)
    .then(() => {});

  const msg =
    `💸 <b>REFUND REQUEST</b>\n\n` +
    `👤 Customer: ${customerName ?? "N/A"} · <code>${customerPhone}</code>\n` +
    `📦 Order: ${String(network).toUpperCase()} ${bundleSize}\n` +
    `📎 Ref: <code>${reference}</code>\n\n` +
    `📱 MoMo Name: <b>${refundName}</b>\n` +
    `📲 MoMo Number: <code>${refundPhone}</code>\n\n` +
    `➡️ Send refund via Mobile Money within 12 hours.`;

  sendSwiftAlert(msg).catch(() => {});
  sendAdminWhatsApp(msg.replace(/<[^>]*>/g, "")).catch(() => {});

  return Response.json({ success: true });
}
