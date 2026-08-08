import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

async function getSetting(key: string, def = "1") {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? def;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [mtn, telecel, at, mashup, autoHours, autoStart, autoEnd, inventor, datacity, datify, slowDelivery, autoApprove, smsApproval, smsAdminPhone, aiOrderGuard, whatsappAi] = await Promise.all([
    getSetting("network_mtn_active", "1"),
    getSetting("network_telecel_active", "1"),
    getSetting("network_at_active", "1"),
    getSetting("network_mashup_active", "1"),
    getSetting("store_auto_hours", "0"),
    getSetting("store_auto_start", "06:00"),
    getSetting("store_auto_end", "23:00"),
    getSetting("inventor_enabled", "1"),
    getSetting("datacity_enabled", "1"),
    getSetting("datify_enabled", "1"),
    getSetting("slow_delivery", "0"),
    getSetting("auto_approve_orders", "0"),
    getSetting("sms_approval_enabled", "0"),
    getSetting("sms_admin_phone", ""),
    getSetting("ai_order_guard_enabled", "1"),
    getSetting("whatsapp_ai_enabled", "1"),
  ]);
  return Response.json({
    mtn: mtn === "1", telecel: telecel === "1", at: at === "1", mashup: mashup === "1",
    autoHours: autoHours === "1", autoStart, autoEnd, inventor: inventor === "1",
    datacity: datacity === "1", datify: datify === "1", slowDelivery: slowDelivery === "1",
    autoApprove: autoApprove === "1", smsApproval: smsApproval === "1", smsAdminPhone,
    smsWebhookReady: Boolean(process.env.SMS_WEBHOOK_SECRET && process.env.SMS_WEBHOOK_SECRET.length >= 24),
    smsTwoWayReady: Boolean(process.env.AT_SMS_SHORTCODE),
    aiOrderGuard: aiOrderGuard !== "0",
    whatsappAi: whatsappAi !== "0",
    deepseekReady: Boolean(process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    whatsappReady: Boolean(process.env.WHATSAPP_API_KEY && process.env.WHATSAPP_WEBHOOK_SECRET),
    smsCallbackUrl: process.env.SMS_WEBHOOK_SECRET && process.env.SMS_WEBHOOK_SECRET.length >= 24
      ? `${process.env.SITE_URL ?? "https://www.elitedata1.com"}/api/webhooks/africastalking?secret=${encodeURIComponent(process.env.SMS_WEBHOOK_SECRET)}`
      : "",
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  async function upsert(k: string, v: string) {
    const { error } = await supabase.from("system_settings").upsert({ key: k, value: v }, { onConflict: "key" });
    if (error) throw new Error(`Failed to save ${k}: ${error.message}`);
  }
  try {
    const tasks: Promise<void>[] = [];
    if (body.smsApproval === true) {
      const configuredPhone = "smsAdminPhone" in body
        ? String(body.smsAdminPhone ?? "").replace(/\s/g, "")
        : await getSetting("sms_admin_phone", "");
      if (!/^(?:\+?233|0)[235][0-9]{8}$/.test(configuredPhone)) {
        return Response.json({ success: false, error: "Save a valid admin Ghana phone number first." }, { status: 400 });
      }
      if (!process.env.SMS_WEBHOOK_SECRET || process.env.SMS_WEBHOOK_SECRET.length < 24) {
        return Response.json({ success: false, error: "The secure SMS webhook key is not configured yet." }, { status: 400 });
      }
      if (!process.env.AT_SMS_SHORTCODE) {
        return Response.json({ success: false, error: "Your Africa's Talking two-way shortcode is not configured yet." }, { status: 400 });
      }
    }
    if ("mtn" in body) tasks.push(upsert("network_mtn_active", body.mtn ? "1" : "0"));
    if ("telecel" in body) tasks.push(upsert("network_telecel_active", body.telecel ? "1" : "0"));
    if ("at" in body) tasks.push(upsert("network_at_active", body.at ? "1" : "0"));
    if ("mashup" in body) tasks.push(upsert("network_mashup_active", body.mashup ? "1" : "0"));
    if ("autoHours" in body) tasks.push(upsert("store_auto_hours", body.autoHours ? "1" : "0"));
    if ("autoStart" in body) tasks.push(upsert("store_auto_start", body.autoStart));
    if ("autoEnd" in body) tasks.push(upsert("store_auto_end", body.autoEnd));
    if ("inventor" in body) tasks.push(upsert("inventor_enabled", body.inventor ? "1" : "0"));
    if ("datacity" in body) tasks.push(upsert("datacity_enabled", body.datacity ? "1" : "0"));
    if ("datify" in body) tasks.push(upsert("datify_enabled", body.datify ? "1" : "0"));
    if ("slowDelivery" in body) tasks.push(upsert("slow_delivery", body.slowDelivery ? "1" : "0"));
    if ("autoApprove" in body) tasks.push(upsert("auto_approve_orders", body.autoApprove ? "1" : "0"));
    if ("smsApproval" in body) tasks.push(upsert("sms_approval_enabled", body.smsApproval ? "1" : "0"));
    if ("aiOrderGuard" in body) tasks.push(upsert("ai_order_guard_enabled", body.aiOrderGuard ? "1" : "0"));
    if ("whatsappAi" in body) tasks.push(upsert("whatsapp_ai_enabled", body.whatsappAi ? "1" : "0"));
    if ("smsAdminPhone" in body) {
      const phone = String(body.smsAdminPhone ?? "").replace(/\s/g, "");
      if (phone && !/^(?:\+?233|0)[235][0-9]{8}$/.test(phone)) {
        return Response.json({ success: false, error: "Enter a valid Ghana phone number." }, { status: 400 });
      }
      tasks.push(upsert("sms_admin_phone", phone));
    }
    await Promise.all(tasks);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
