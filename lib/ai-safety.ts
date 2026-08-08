import { supabase } from "@/lib/supabase";

export function redactAiText(value: string): string {
  return value
    .replace(/\b(?:sk_live|sk_test|sb_secret|key)[-_a-z0-9]{12,}\b/gi, "[REDACTED_KEY]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[REDACTED_CARD]")
    .replace(/\b(?:otp|pin|password)\s*[:=-]?\s*\d{4,8}\b/gi, "$1 [REDACTED]")
    .replace(/\b\d{10,16}\b/g, match => `${match.slice(0, 3)}***${match.slice(-2)}`)
    .slice(0, 8_000);
}

export async function getAiSetting(key: string, fallback: string): Promise<string> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}

export async function logAiActivity(input: { scope: "admin" | "customer" | "agent_screening"; sessionId?: string; role: "user" | "assistant" | "system"; content: string; status?: "success" | "error" | "escalated"; latencyMs?: number }) {
  const content = redactAiText(input.content);
  const tokens = Math.ceil(content.length / 4);
  const { data } = await supabase.from("ai_activity").insert({
    scope: input.scope, session_id: input.sessionId ?? null, role: input.role,
    content_redacted: content, status: input.status ?? "success",
    latency_ms: input.latencyMs ?? 0, estimated_tokens: tokens,
    estimated_cost_usd: Number(((tokens / 1_000_000) * 0.42).toFixed(6)),
  }).select("id").maybeSingle();
  return data?.id as string | undefined;
}

export async function buildCustomerKnowledge() {
  const [prices, mashup, voucherPrices, stock, settings] = await Promise.all([
    supabase.from("bundle_prices").select("network,size_label,price,active").eq("active", true).limit(100),
    supabase.from("mashup_bundles").select("name,data_value,data_unit,minutes,price,active").eq("active", true).limit(100),
    supabase.from("system_settings").select("value").eq("key", "voucher_prices").maybeSingle(),
    supabase.from("voucher_inventory").select("voucher_type,status").eq("status", "available"),
    supabase.from("system_settings").select("key,value").in("key", ["slow_delivery","network_mtn_active","network_telecel_active","network_at_active"]),
  ]);
  const counts = (stock.data ?? []).reduce<Record<string, number>>((all, item) => {
    const key = String(item.voucher_type); all[key] = (all[key] ?? 0) + 1; return all;
  }, {});
  return { bundles: prices.data ?? [], mashup: mashup.data ?? [], voucherPrices: voucherPrices.data?.value ?? null, voucherStock: counts, settings: settings.data ?? [] };
}

export async function createAiEscalation(sessionId: string, summary: string) {
  const redacted = redactAiText(summary);
  const { data } = await supabase.from("ai_escalations").insert({ session_id: sessionId, summary_redacted: redacted }).select("id").single();
  return { id: data?.id, summary: redacted };
}
