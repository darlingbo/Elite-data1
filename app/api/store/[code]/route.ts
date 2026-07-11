import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code) return Response.json({ error: "Referral code required." }, { status: 400 });

  // Look up agent by referral code
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, business_name, shop_name, tagline, store_color, referral_code, agent_type, plan, status")
    .eq("referral_code", code.toUpperCase())
    .maybeSingle();

  if (!agent || agent.status !== "approved") {
    return Response.json({ error: "Store not found." }, { status: 404 });
  }

  // Load all active bundles with admin prices
  const { data: bundles } = await supabase
    .from("bundle_prices")
    .select("id, network, size, price, active")
    .eq("active", true)
    .order("network")
    .order("price");

  // Load agent's custom prices (only for pro agents)
  let agentPriceMap: Record<string, number> = {};
  if ((agent as { plan?: string }).plan === "pro") {
    const { data: agentPrices } = await supabase
      .from("agent_bundle_prices")
      .select("bundle_id, custom_price")
      .eq("agent_id", agent.id)
      .eq("active", true);
    for (const p of agentPrices ?? []) {
      agentPriceMap[p.bundle_id] = Number(p.custom_price);
    }
  }

  const bundleList = (bundles ?? []).map(b => ({
    id: b.id,
    network: b.network,
    size: b.size,
    price: (agent as { plan?: string }).plan === "pro" ? (agentPriceMap[b.id] ?? Number(b.price)) : Number(b.price),
    admin_price: Number(b.price),
  }));

  return Response.json({
    agent: {
      id: agent.id,
      name: agent.shop_name ?? agent.business_name ?? agent.name,
      tagline: agent.tagline ?? null,
      color: agent.store_color ?? "#3b82f6",
      referral_code: agent.referral_code,
      agent_type: agent.agent_type,
    },
    bundles: bundleList,
  });
}
