import { supabase } from "@/lib/supabase";

const DEFAULT_AGENT_RATE = 0.8;

export async function resolveAgentCommissionRate(agentId: string): Promise<number> {
  const [overrideResult, globalResult] = await Promise.all([
    supabase
      .from("agent_commission_overrides")
      .select("agent_pct")
      .eq("agent_id", agentId)
      .maybeSingle(),
    supabase
      .from("commission_settings")
      .select("agent_pct")
      .eq("id", "global")
      .maybeSingle(),
  ]);

  const percentage = overrideResult.data?.agent_pct ?? globalResult.data?.agent_pct;
  if (percentage == null) return DEFAULT_AGENT_RATE;

  const numericPercentage = Number(percentage);
  if (!Number.isFinite(numericPercentage) || numericPercentage < 0 || numericPercentage > 100) {
    return DEFAULT_AGENT_RATE;
  }

  return numericPercentage / 100;
}
