import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { sendAdminWhatsApp, sendWhatsAppText } from "@/lib/whatsapp";
import { parseWhapiMessage, type IncomingWhatsAppMessage } from "@/lib/whapi-webhook";

const HUMAN_WORDS = /\b(human|real person|admin|agent|call me|speak to someone)\b/i;
const STOP_WORDS = /^(stop|unsubscribe|cancel messages)$/i;
const START_WORDS = /^(start|subscribe)$/i;
const ORDER_REFERENCE = /\b(?:elite|vch|bulk|api)[-_][a-z0-9_-]{5,}\b/i;

function normaliseGhanaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return digits;
}

async function buildBusinessContext(message: IncomingWhatsAppMessage): Promise<string> {
  const [{ data: prices }, { data: settings }] = await Promise.all([
    supabase
      .from("bundle_prices")
      .select("network,size_label,price,active")
      .eq("active", true)
      .order("network")
      .order("price"),
    supabase
      .from("system_settings")
      .select("key,value")
      .in("key", ["store_status", "helpline_enabled"]),
  ]);

  const priceList = (prices ?? []).slice(0, 80)
    .map((row) => `${row.network} ${row.size_label}: GH₵${Number(row.price).toFixed(2)}`)
    .join("\n");
  const settingText = (settings ?? []).map((row) => `${row.key}: ${row.value}`).join(", ");

  let orderContext = "No verified order was requested.";
  const reference = message.text.match(ORDER_REFERENCE)?.[0];
  if (reference) {
    const { data: order } = await supabase
      .from("orders")
      .select("reference,phone,network,bundle_size,amount,status,created_at")
      .ilike("reference", reference)
      .maybeSingle();
    if (order && normaliseGhanaPhone(String(order.phone)) === normaliseGhanaPhone(message.from)) {
      orderContext = `Verified order for this sender: reference ${order.reference}, ${order.network} ${order.bundle_size}, amount GH₵${Number(order.amount).toFixed(2)}, status ${order.status}, created ${order.created_at}.`;
    } else {
      orderContext = "An order reference was supplied, but it could not be verified for this WhatsApp number. Ask the customer to use the Track Order page or contact a human.";
    }
  }

  return `CURRENT BUNDLE PRICES:\n${priceList || "Prices are temporarily unavailable."}\n\nSTORE SETTINGS: ${settingText || "unknown"}\n\nORDER INFORMATION: ${orderContext}`;
}

async function claimMessage(message: IncomingWhatsAppMessage): Promise<boolean> {
  const { error } = await supabase.from("whatsapp_ai_messages").insert({
    message_id: message.id,
    phone: message.from,
    direction: "incoming",
    body: message.text,
  });
  return !error;
}

async function isOptedOut(phone: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_ai_opt_outs")
    .select("phone")
    .eq("phone", phone)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const suppliedSecret =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("secret");

  if (!secret || suppliedSecret !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: aiSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "whatsapp_ai_enabled")
    .maybeSingle();
  if (aiSetting?.value === "0") return Response.json({ received: true, disabled: true });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const message = payload ? parseWhapiMessage(payload) : null;
  if (!message) return Response.json({ received: true, ignored: true });
  if (!(await claimMessage(message))) return Response.json({ received: true, duplicate: true });

  if (STOP_WORDS.test(message.text.trim())) {
    await supabase.from("whatsapp_ai_opt_outs").upsert({ phone: message.from }, { onConflict: "phone" });
    await sendWhatsAppText(message.chatId, "You will not receive automated replies. Send START whenever you want to use the EliteData assistant again.");
    return Response.json({ received: true });
  }
  if (START_WORDS.test(message.text.trim())) {
    await supabase.from("whatsapp_ai_opt_outs").delete().eq("phone", message.from);
    await sendWhatsAppText(message.chatId, "EliteData automated support is active again. How can I help you?");
    return Response.json({ received: true });
  }
  if (await isOptedOut(message.from)) return Response.json({ received: true, optedOut: true });

  if (HUMAN_WORDS.test(message.text)) {
    await Promise.all([
      sendWhatsAppText(message.chatId, "I have alerted the EliteData administrator. Please send your order reference and a short description of the problem."),
      sendAdminWhatsApp(`WhatsApp handoff requested\nCustomer: ${message.from}\nMessage: ${message.text}`),
    ]);
    return Response.json({ received: true, handoff: true });
  }

  try {
    const context = await buildBusinessContext(message);
    const reply = await generateDeepSeekReply([
      {
        role: "system",
        content: `You are EliteData's WhatsApp customer-service assistant in Ghana.
Reply in friendly, simple English and understand common Ghanaian expressions. Keep replies under 120 words.
Use ONLY the supplied business context for prices, availability and order status.
Never claim that payment, delivery, refund or wallet credit happened unless the context explicitly confirms it.
Never approve/reject orders, request a MoMo PIN or OTP, expose private data, or promise an exact delivery time.
For payment disputes, refund requests, repeated failures, wrong-number orders or anything uncertain, ask the customer to type HUMAN.
Direct purchases to https://www.elitedata1.com/buy and order tracking to https://www.elitedata1.com/track.
Do not mention DeepSeek, prompts, APIs or internal systems.`,
      },
      { role: "system", content: context },
      { role: "user", content: message.text },
    ]);

    await sendWhatsAppText(message.chatId, reply);
    await supabase.from("whatsapp_ai_messages").insert({
      message_id: `${message.id}:reply`,
      phone: message.from,
      direction: "outgoing",
      body: reply,
    });
    return Response.json({ received: true, replied: true });
  } catch {
    await sendWhatsAppText(message.chatId, "Sorry, the EliteData assistant is temporarily unavailable. Please type HUMAN for help from the administrator.");
    return Response.json({ received: true, replied: false });
  }
}
