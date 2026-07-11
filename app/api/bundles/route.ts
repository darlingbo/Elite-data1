import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles, sizeLabel } from "@/lib/bundles";

export async function GET(request: NextRequest) {
  const agentCode = request.nextUrl.searchParams.get("agent");

  const { data: overrides } = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active, size_label, size_gb, validity, network");

  const rows = overrides ?? [];
  const overrideMap = new Map(rows.map((o: { id: string }) => [o.id, o]));
  const defaultIds = new Set(defaultBundles.map((b) => b.id));

  const defaultFiltered = defaultBundles
    .filter((b) => {
      const ov = overrideMap.get(b.id) as { active?: boolean } | undefined;
      return ov ? ov.active !== false : true;
    })
    .map((b) => {
      const ov = overrideMap.get(b.id) as { price?: number; cost_price?: number; size_label?: string; size_gb?: number; validity?: string } | undefined;
      if (!ov) return b;
      const sizeGB = ov.size_gb ?? b.sizeGB;
      const size = ov.size_label ?? (ov.size_gb != null ? sizeLabel(sizeGB) : b.size);
      return {
        ...b,
        price: ov.price ?? b.price,
        costPrice: ov.cost_price ?? b.costPrice,
        size,
        sizeGB,
        validity: ov.validity ?? b.validity,
      };
    });

  const customBundles = rows
    .filter((o: { id: string; network?: string; active?: boolean }) =>
      !defaultIds.has(o.id) && o.network && o.active !== false
    )
    .map((o: { id: string; network: string; size_label?: string; size_gb?: number; validity?: string; price: number; cost_price: number }) => ({
      id: o.id,
      network: o.network as "mtn" | "telecel" | "airteltigo",
      size: o.size_label ?? o.id,
      sizeGB: o.size_gb ?? 1,
      validity: o.validity ?? "30 days",
      price: o.price,
      costPrice: o.cost_price,
    }));

  const netOrder: Record<string, number> = { mtn: 0, telecel: 1, airteltigo: 2 };
  let allBundles = [...defaultFiltered, ...customBundles].sort((a, b) => {
    const netDiff = (netOrder[a.network] ?? 9) - (netOrder[b.network] ?? 9);
    if (netDiff !== 0) return netDiff;
    return (a.sizeGB ?? 0) - (b.sizeGB ?? 0);
  });

  // If agent code provided and agent is custom_price type, show their markup prices
  if (agentCode) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, agent_type, plan")
      .eq("referral_code", agentCode.toUpperCase())
      .eq("status", "approved")
      .maybeSingle();

    if (agent?.agent_type === "custom_price") {
      // Get admin's tier prices as the base
      const { data: tierPrices } = await supabase
        .from("custom_tier_prices")
        .select("bundle_id, price");
      const tierMap = new Map((tierPrices ?? []).map((p: { bundle_id: string; price: number }) => [p.bundle_id, p.price]));
      void tierMap;

      // Get this agent's personal markup prices
      const { data: agentPrices } = await supabase
        .from("agent_bundle_prices")
        .select("bundle_id, custom_price")
        .eq("agent_id", agent.id)
        .eq("active", true);
      const agentMap = new Map((agentPrices ?? []).map((p: { bundle_id: string; custom_price: number }) => [p.bundle_id, p.custom_price]));

      // Only show bundles the agent has explicitly priced — apply their price
      allBundles = allBundles
        .filter(b => agentMap.has(b.id))
        .map(b => ({ ...b, price: agentMap.get(b.id)! }));
    }

    if (agent && (agent as { plan?: string }).plan === "pro") {
      // Pro agent: show all admin bundles, but apply their custom price where set
      const { data: agentPrices } = await supabase
        .from("agent_bundle_prices")
        .select("bundle_id, custom_price")
        .eq("agent_id", agent.id)
        .eq("active", true);
      const agentMap = new Map((agentPrices ?? []).map((p: { bundle_id: string; custom_price: number }) => [p.bundle_id, Number(p.custom_price)]));

      allBundles = allBundles.map(b => ({
        ...b,
        price: agentMap.has(b.id) ? agentMap.get(b.id)! : b.price,
      }));
    }
  }

  return Response.json({ bundles: allBundles });
}
