import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles as staticBundles } from "@/lib/bundles";

export async function GET(request: NextRequest) {
  const agentCode = request.nextUrl.searchParams.get("agentCode");
  const bundleId = request.nextUrl.searchParams.get("bundleId");

  if (!agentCode || !bundleId) {
    return Response.json({ canFulfill: true });
  }

  const [agentResult, costResult] = await Promise.all([
    supabase
      .from("agents")
      .select("wallet_balance, agent_type, status")
      .eq("referral_code", agentCode.toUpperCase())
      .eq("status", "approved")
      .maybeSingle(),
    supabase
      .from("bundle_prices")
      .select("cost_price")
      .eq("id", bundleId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  const agent = agentResult.data;
  if (!agent || agent.agent_type !== "custom_price") {
    return Response.json({ canFulfill: true });
  }

  // Try DB cost price first, fall back to static bundle list
  const rawCost = costResult.data?.cost_price
    ?? staticBundles.find((b) => b.id === bundleId)?.costPrice;

  if (rawCost == null) {
    return Response.json({ canFulfill: true });
  }

  const walletBalance = Number(agent.wallet_balance ?? 0);
  const canFulfill = walletBalance >= Number(rawCost);

  return Response.json({
    canFulfill,
    ...(canFulfill ? {} : { reason: "Agent wallet has insufficient funds." }),
  });
}
