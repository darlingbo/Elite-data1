import { NextRequest } from "next/server";
import { sendSwiftAlert } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { supabase } from "@/lib/supabase";

const REFUND_LOG_KEY = "refund_log";

async function appendRefundLog(entry: Record<string, unknown>) {
  // Read existing log
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", REFUND_LOG_KEY)
    .maybeSingle();

  let existing: Record<string, unknown>[] = [];
  try { existing = JSON.parse(data?.value ?? "[]"); } catch { existing = []; }

  existing.push({ ...entry, saved_at: new Date().toISOString() });

  await supabase
    .from("system_settings")
    .upsert({ key: REFUND_LOG_KEY, value: JSON.stringify(existing) }, { onConflict: "key" });
}

export async function POST(req: NextRequest) {
  const { reference, customerPhone, customerName, network, bundleSize, refundName, refundPhone } = await req.json();

  // 1. Persist to append-only refund log — never disappears
  if (reference && refundPhone) {
    appendRefundLog({
      id: crypto.randomUUID(),
      reference: String(reference).trim(),
      customer_name: customerName ?? null,
      customer_phone: customerPhone ?? null,
      network: network ?? null,
      bundle_size: bundleSize ?? null,
      refund_name: refundName ?? null,
      refund_phone: String(refundPhone).trim(),
    }).catch(() => {});

    // 2. Also update the order record (best effort — log won't disappear even if this fails)
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
