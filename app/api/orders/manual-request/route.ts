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

  if (reference && refundPhone) {
    // Merge refund details into the existing log entry (created at order time)
    upsertRefundLog(String(reference).trim(), {
      customer_name: customerName ?? null,
      customer_phone: customerPhone ?? null,
      network: network ?? null,
      bundle_size: bundleSize ?? null,
      refund_name: refundName ?? null,
      refund_phone: String(refundPhone).trim(),
    }).catch(() => {});

    // Also update orders table (best effort)
    supabase
      .from("orders")
      .update({ refund_phone: String(refundPhone).trim(), refund_network: null })
      .eq("reference", String(reference).trim())
      .then(() => {});
  }

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
