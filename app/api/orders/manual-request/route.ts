import { NextRequest } from "next/server";
import { sendRefundRequestAlert, tgEscape } from "@/lib/telegram";
import { getPaymentAttempt } from "@/lib/payment-attempt";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { supabase } from "@/lib/supabase";
import { tooMany } from "@/lib/public-limit";

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
  const blocked = await tooMany(req, "refund-request", 6, 3600000);
  if (blocked) return blocked;

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

  // Where did the money come from? A refund to a different number is a classic scam,
  // so the alert says so plainly. Everything the customer typed is escaped first.
  let payerNote = "";
  try {
    const { data: full } = await supabase.from("orders").select("paystack_reference").eq("reference", cleanRef).maybeSingle();
    const attempt = await getPaymentAttempt(String(full?.paystack_reference ?? cleanRef)).catch(() => null);
    const payer = String((attempt?.metadata as { payerPhone?: string } | undefined)?.payerPhone ?? "").replace(/\s/g, "");
    const asked = String(refundPhone).replace(/\s/g, "");
    if (payer) {
      payerNote = payer === asked
        ? `✅ Same number that paid: <code>${tgEscape(payer)}</code>

`
        : `⚠️ <b>DIFFERENT NUMBER.</b> The payment came from <code>${tgEscape(payer)}</code>. Check with the customer before sending.

`;
    }
  } catch { /* the note is optional */ }

  const msg =
    `💸 <b>REFUND REQUEST</b>

` +
    `👤 Customer: ${tgEscape(String(customerName ?? "N/A"))} · <code>${tgEscape(String(customerPhone))}</code>
` +
    `📦 Order: ${tgEscape(String(network ?? "").toUpperCase())} ${tgEscape(String(bundleSize ?? ""))}
` +
    `📎 Ref: <code>${tgEscape(cleanRef)}</code>

` +
    payerNote +
    `📱 MoMo Name: <b>${tgEscape(String(refundName ?? ""))}</b>
` +
    `📲 MoMo Number: <code>${tgEscape(String(refundPhone))}</code>

` +
    `➡️ Send refund via Mobile Money within 12 hours.`;

  sendRefundRequestAlert(msg).catch(() => {});
  sendAdminWhatsApp(msg.replace(/<[^>]*>/g, "")).catch(() => {});

  return Response.json({ success: true });
}
