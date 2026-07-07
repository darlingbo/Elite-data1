import { NextRequest } from "next/server";
import { sendAdminAlert, sendAdminBotMessage } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const { reference, customerPhone, customerName, network, bundleSize, refundName, refundPhone } = await req.json();

  const msg =
    `💸 <b>REFUND REQUEST</b>\n\n` +
    `👤 Customer: ${customerName ?? "N/A"} · <code>${customerPhone}</code>\n` +
    `📦 Order: ${String(network).toUpperCase()} ${bundleSize}\n` +
    `📎 Ref: <code>${reference}</code>\n\n` +
    `📱 MoMo Name: <b>${refundName}</b>\n` +
    `📲 MoMo Number: <code>${refundPhone}</code>\n\n` +
    `➡️ Send refund via Mobile Money within 12 hours.`;

  sendAdminAlert(msg).catch(() => {});
  sendAdminBotMessage(msg).catch(() => {});
  sendAdminWhatsApp(msg.replace(/<[^>]*>/g, "")).catch(() => {});

  return Response.json({ success: true });
}
