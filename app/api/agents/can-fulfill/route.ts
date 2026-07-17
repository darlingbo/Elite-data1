import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAgentBundleCost } from "@/lib/agent-pricing";

export async function GET(request: NextRequest) {
  const agentCode = request.nextUrl.searchParams.get("agentCode");
  const bundleId = request.nextUrl.searchParams.get("bundleId");

  if (!agentCode || !bundleId) {
    return Response.json({ canFulfill: true });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("wallet_balance, agent_type, status, registration_ref, paystack_subaccount_code")
    .eq("referral_code", agentCode.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();

  if (!agent) {
    return Response.json({ canFulfill: true });
  }

  const subaccountCode = (agent as { paystack_subaccount_code?: string | null }).paystack_subaccount_code ?? null;

  if (agent.agent_type !== "custom_price") {
    return Response.json({ canFulfill: true, subaccountCode });
  }

  const cost = await getAgentBundleCost(bundleId, agent.registration_ref, agent.agent_type);
  if (cost == null) return Response.json({ canFulfill: true, subaccountCode });

  const walletBalance = Number(agent.wallet_balance ?? 0);
  const canFulfill = walletBalance >= cost;

  return Response.json({
    canFulfill,
    subaccountCode,
    ...(canFulfill ? {} : { reason: "Agent wallet has insufficient funds." }),
  });
}
