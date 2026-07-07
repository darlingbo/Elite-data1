import { NextRequest } from "next/server";
import { sendAdminAlert, sendAdminBotMessage, retryKeyboard } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const { reference, customerPhone, customerName, network, bundleSize, waPhone, note } = await req.json();

  const msg =
    `📋 <b>MANUAL DELIVERY REQUEST</b>\n\n` +
    `👤 ${customerName ?? "Customer"} · <code>${customerPhone}</code>\n` +
    `📦 ${String(network).toUpperCase()} ${bundleSize}\n` +
    `📎 Ref: <code>${reference}</code>\n\n` +
    (waPhone ? `📱 WhatsApp: <code>${waPhone}</code>\n` : "") +
    (note ? `💬 Note: ${note}\n` : "") +
    `\n➡️ Deliver manually then mark completed in admin panel.`;

  sendAdminAlert(msg).catch(() => {});
  sendAdminBotMessage(msg, retryKeyboard(reference)).catch(() => {});
  sendAdminWhatsApp(msg.replace(/<[^>]*>/g, "")).catch(() => {});

  return Response.json({ success: true });
}
