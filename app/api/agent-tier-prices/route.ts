import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAllAgentBundleCosts } from "@/lib/agent-pricing";

// Public read — returns plan-specific cost prices for agents
export async function GET(request: NextRequest) {
  const agentCode = request.nextUrl.searchParams.get("agentCode");

  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents")
      .select("registration_ref, agent_type, plan")
      .eq("referral_code", agentCode.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();

    if (agent) {
      const agentPlan = (agent as { plan?: string | null }).plan ?? "free";
      const prices = await getAllAgentBundleCosts(agent.registration_ref, agent.agent_type, agentPlan);
      return Response.json({ prices, plan: agentPlan });
    }
  }

  // Default fallback: return pro tier prices
  const { data } = await supabase.from("custom_tier_prices").select("bundle_id, price");
  return Response.json({ prices: data ?? [], plan: "pro" });
}
