import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

const CONTROL_KEYS = [
  "customer_ai_enabled",
  "whatsapp_ai_enabled",
  "ai_order_guard_enabled",
  "ai_daily_request_limit",
  "auto_approve_orders",
  "voucher_prices",
  "store_auto_hours",
  "store_auto_start",
  "store_auto_end",
];

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, vouchers, activity, escalations] = await Promise.all([
    supabase.from("system_settings").select("key,value,updated_at").in("key", CONTROL_KEYS),
    supabase.from("voucher_inventory").select("id,voucher_type,code,status,order_reference,created_at,assigned_at,sent_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("ai_activity").select("id,scope,role,content_redacted,status,latency_ms,estimated_tokens,estimated_cost_usd,feedback,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("ai_escalations").select("id,session_id,summary_redacted,status,created_at,resolved_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const error = settings.error || vouchers.error || activity.error || escalations.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    settings: Object.fromEntries((settings.data ?? []).map(row => [row.key, row.value])),
    vouchers: vouchers.data ?? [],
    activity: activity.data ?? [],
    escalations: escalations.data ?? [],
  });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { type?: string; key?: string; value?: string; id?: string; status?: string; note?: string };

  if (body.type === "setting") {
    if (!body.key || !CONTROL_KEYS.includes(body.key) || body.value === undefined) {
      return Response.json({ error: "Invalid setting" }, { status: 400 });
    }
    const { error } = await supabase.from("system_settings").upsert({ key: body.key, value: String(body.value), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.type === "escalation") {
    if (!body.id || !body.status) return Response.json({ error: "Missing escalation update" }, { status: 400 });
    const { error } = await supabase.from("ai_escalations").update({ status: body.status, resolved_at: body.status === "resolved" ? new Date().toISOString() : null }).eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown update" }, { status: 400 });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { voucherType?: string; codes?: string[] };
  const voucherType = String(body.voucherType ?? "").toUpperCase();
  const codes = Array.from(new Set((body.codes ?? []).map(v => v.trim()).filter(Boolean)));
  if (!(["BECE", "WASSCE"].includes(voucherType)) || codes.length === 0) {
    return Response.json({ error: "Choose BECE or WASSCE and enter voucher codes" }, { status: 400 });
  }
  const { error } = await supabase.from("voucher_inventory").insert(codes.map(code => ({ voucher_type: voucherType, code, status: "available" })));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, added: codes.length });
}
