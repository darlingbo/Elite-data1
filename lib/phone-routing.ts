import { supabase } from "./supabase";

export type RoutedProvider = "inventor" | "datacity" | "datify";

export interface RoutingRule {
  id: string;
  match: string;        // full number or prefix e.g. "0591234567" or "059"
  provider: RoutedProvider;
  label?: string;       // optional admin note
}

export async function getRoutingRules(): Promise<RoutingRule[]> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "phone_routing_rules")
    .maybeSingle();
  if (!data?.value) return [];
  try { return JSON.parse(data.value) as RoutingRule[]; } catch { return []; }
}

export async function saveRoutingRules(rules: RoutingRule[]): Promise<void> {
  await supabase
    .from("system_settings")
    .upsert({ key: "phone_routing_rules", value: JSON.stringify(rules) }, { onConflict: "key" });
}

// Returns the provider to use for this phone, or null if no rule matches.
// Most specific rule (longest match) wins.
export function matchPhone(phone: string, rules: RoutingRule[]): RoutedProvider | null {
  const cleaned = phone.replace(/\s/g, "");
  const sorted = [...rules].sort((a, b) => b.match.length - a.match.length);
  for (const rule of sorted) {
    if (cleaned.startsWith(rule.match.replace(/\s/g, ""))) return rule.provider;
  }
  return null;
}
