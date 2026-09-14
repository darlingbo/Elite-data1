import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAssistantAlert } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { approveOrder } from "@/lib/order-approval";
import { rejectOrder } from "@/lib/order-rejection";
import { getSmsApprovalSettings, normaliseGhanaPhone, sendAdminCommandReplySMS } from "@/lib/sms";

/**
 * Inbound SMS webhook — was Africa's Talking, now MessagePilot.
 *
 * NOT VERIFIED against a live MessagePilot inbound callback yet. AT's
 * incoming-message callback posted form-encoded `from`/`text`/`to`/`date`
 * fields, which this still parses (plus a JSON fallback) — MessagePilot's
 * actual inbound-SMS webhook payload shape hasn't been confirmed (their docs
 * cover outbound send clearly; the two-way/incoming-message callback shape
 * needs checking against your dashboard once it's registered there). If
 * replies stop reaching this route after switching, that's the first thing
 * to check — adjust the field names below to whatever MessagePilot actually
 * posts.
 *
 * This is only ONE of several approval channels (Telegram and WhatsApp
 * alerts also fire on every inbound message below) — SMS-reply approval
 * still works without this being exactly right, it just won't get the
 * "APPROVE/REJECT via SMS" shortcut until confirmed.
 */

export async function GET() {
  return new Response("OK", { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    let from = "";
    let text = "";
    let to = "";
    let date = "";

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}) as Record<string, unknown>);
      from = String(body.from ?? body.sender ?? body.source ?? "").trim();
      text = String(body.text ?? body.message ?? "").trim();
      to = String(body.to ?? body.destination ?? "").trim();
      date = String(body.date ?? body.timestamp ?? "").trim();
    } else {
      const form = await request.formData();
      from = String(form.get("from") ?? form.get("sender") ?? "").trim();
      text = String(form.get("text") ?? form.get("message") ?? "").trim();
      to   = String(form.get("to")   ?? "").trim();
      date = String(form.get("date") ?? "").trim();
    }

    if (!from || !text) return new Response("OK", { status: 200 });

    // Look up the most recent order for this phone number
    const normalizedFrom = from.replace(/^\+233/, "0");

    const command = text.match(/^\s*(APPROVE|REJECT)\s+([A-Z0-9_-]{3,100})\s*$/i);
    if (command) {
      const expectedSecret = process.env.SMS_WEBHOOK_SECRET ?? "";
      const suppliedSecret =
        request.headers.get("x-webhook-secret") ??
        request.nextUrl.searchParams.get("secret") ??
        "";
      const { enabled, adminPhone } = await getSmsApprovalSettings();
      const authorised =
        enabled &&
        expectedSecret.length >= 24 &&
        suppliedSecret === expectedSecret &&
        Boolean(adminPhone) &&
        normaliseGhanaPhone(from) === normaliseGhanaPhone(adminPhone);

      if (!authorised) {
        sendAssistantAlert(
          `Unauthorized SMS approval command blocked. From: <code>${from}</code>`,
        ).catch(() => {});
        return new Response("OK", { status: 200 });
      }

      const action = command[1].toUpperCase();
      const reference = command[2];
      const result = action === "APPROVE"
        ? await approveOrder(reference, "sms")
        : await rejectOrder(reference, "sms");
      await sendAdminCommandReplySMS(
        adminPhone,
        `${action} ${reference}: ${result.ok ? "SUCCESS" : "NOT COMPLETED"} - ${result.message}`,
      );
      return new Response("OK", { status: 200 });
    }

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

    sendAssistantAlert(msg).catch(() => {});
    sendAdminWhatsApp(msg.replace(/<[^>]*>/g, "")).catch(() => {});

    return new Response("OK", { status: 200 });
  } catch {
    return new Response("OK", { status: 200 });
  }
}
