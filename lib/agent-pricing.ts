import { supabase } from "./supabase";
import { bundles as staticBundles } from "./bundles";

export const FREE_AGENT_DISCOUNT = 0.04; // 4% off customer selling price

// "FREE" is the sentinel stored for Free-plan agents. null = legacy Pro agent.
const isFreeRef = (ref: string | null | undefined) => ref === "FREE";

/**
 * Returns the cost price for ONE bundle for an agent based on their plan.
 * Pro (registration_ref ≠ "FREE") → custom_tier_prices
 * Free (registration_ref === "FREE") → bundle_prices.price × 0.96 (customer price - 4%)
 */
export async function getAgentBundleCost(
  bundleId: string,
  registrationRef: string | null | undefined
): Promise<number | null> {
  const isPro = !isFreeRef(registrationRef);

  if (isPro) {
    const { data } = await supabase
      .from("custom_tier_prices")
      .select("price")
      .eq("bundle_id", bundleId)
      .maybeSingle();
    if (data?.price != null) return Number(data.price);
    // Fallback for Pro if no tier price set
    return getCustomerPrice(bundleId);
  }

  // Free agent: customer selling price × 0.96
  const customerPrice = await getCustomerPrice(bundleId);
  if (customerPrice != null) {
    return parseFloat((customerPrice * (1 - FREE_AGENT_DISCOUNT)).toFixed(2));
  }
  return null;
}

/**
 * Returns ALL bundle costs for an agent as { bundle_id, price }[].
 * Mirrors exactly what /api/bundles returns so the price list always matches.
 */
export async function getAllAgentBundleCosts(
  registrationRef: string | null | undefined
): Promise<{ bundle_id: string; price: number }[]> {
  const isPro = !isFreeRef(registrationRef);

  if (isPro) {
    const { data } = await supabase
      .from("custom_tier_prices")
      .select("bundle_id, price");
    return (data ?? []).map(r => ({ bundle_id: r.bundle_id, price: Number(r.price) }));
  }

  // Free agent: replicate /api/bundles active-bundle logic, price each × 0.96
  const { data: dbRows } = await supabase
    .from("bundle_prices")
    .select("id, price, active");

  if (!dbRows) return [];

  const defaultIds = new Set(staticBundles.map(b => b.id));
  const dbMap = new Map<string, { price: number; active: boolean | null }>();
  for (const row of dbRows) {
    dbMap.set(row.id, { price: Number(row.price), active: row.active as boolean | null });
  }

  const result: { bundle_id: string; price: number }[] = [];

  // Static bundles — include unless explicitly deactivated in DB
  for (const b of staticBundles) {
    const override = dbMap.get(b.id);
    if (override?.active === false) continue;
    const customerPrice = override?.price ?? b.price;
    result.push({ bundle_id: b.id, price: parseFloat((customerPrice * (1 - FREE_AGENT_DISCOUNT)).toFixed(2)) });
  }

  // Custom bundles (not in the static list) — include if active !== false
  for (const [id, { price, active }] of dbMap) {
    if (defaultIds.has(id)) continue;
    if (active === false) continue;
    result.push({ bundle_id: id, price: parseFloat((price * (1 - FREE_AGENT_DISCOUNT)).toFixed(2)) });
  }

  return result;
}

// ── internal helper ──────────────────────────────────────────────────────────

async function getCustomerPrice(bundleId: string): Promise<number | null> {
  const { data } = await supabase
    .from("bundle_prices")
    .select("price, active")
    .eq("id", bundleId)
    .maybeSingle();

  if (data) {
    if (data.active === false) return null; // explicitly deactivated — don't fall back
    if (data.price != null) return Number(data.price);
  }

  // No DB entry → fall back to static bundle price
  return staticBundles.find(b => b.id === bundleId)?.price ?? null;
}
