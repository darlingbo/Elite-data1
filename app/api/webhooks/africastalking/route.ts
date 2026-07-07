import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    // Africa's Talking sends form-encoded POST
    const form = await request.formData();
    const from = String(form.get("from") ?? "").trim();
    const text = String(form.get("text") ?? "").trim();
    const to   = String(form.get("to")   ?? "").trim();
    const date = String(form.get("date") ?? "").trim();

    if (!from || !text) return new Response("OK", { status: 200 });

    // Look up the most recent order for this phone number
    const normalizedFrom = from.replace(/^\+233/, "0");
    const { data: order } = await supabase
      .from("orders")
      .select("reference, network, bundle_size, status, created_at")
      .or(`phone.eq.${normalizedFrom},phone.eq.${from}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const orderLine = order
      ? `📦 Last order: ${order.network?.toUpperCase()} ${order.bundle_size} · ${order.status?.toUpperCase()} · Ref: ${order.reference}`
      : "📦 No order found for this number";

    const msg =
      `💬 <b>Customer SMS Reply</b>\n\n` +
      `📱 From: <code>${from}</code>\n` +
      `🕐 ${date || new Date().toLocaleString("en-GH", { timeZone: "Africa/Accra" })}\n\n` +
      `💬 Message:\n"${text}"\n\n` +
      `${orderLine}`;

    sendAdminAlert(msg).catch(() => {});
    sendAdminWhatsApp(msg.replace(/<[^>]*>/g, "")).catch(() => {});

    return new Response("OK", { status: 200 });
  } catch {
    return new Response("OK", { status: 200 });
  }
}
