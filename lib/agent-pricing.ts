import { supabase } from "./supabase";
import { bundles as staticBundles } from "./bundles";

export const FREE_AGENT_DISCOUNT = 0.04; // 4% off customer price for custom_price (free plan) agents

/**
 * Returns the wallet purchase cost for ONE bundle based on agent type:
 *
 * - commission    → full customer price (they earn % commission split)
 * - custom_price  → customer price × 0.96 (4% discount, wallet-based)
 * - pro           → custom_tier_prices (admin-set wholesale prices, Paystack direct)
 */
export async function getAgentBundleCost(
  bundleId: string,
  _registrationRef: string | null | undefined,
  agentType?: string | null,
  plan?: string | null
): Promise<number | null> {
  const customerPrice = await getCustomerPrice(bundleId);
  if (customerPrice == null) return null;

  // Commission agents pay full customer price (they earn % split, no price-setting)
  if (agentType === "commission") return customerPrice;

  // Pro plan custom_price agents: admin-set tier price, fallback to admin price
  if (plan === "pro") {
    const { data } = await supabase
      .from("custom_tier_prices")
      .select("price")
      .eq("bundle_id", bundleId)
      .maybeSingle();
    if (data?.price != null) return Number(data.price);
    return customerPrice;
  }

  // Free plan custom_price agents: 4% off admin selling price
  return parseFloat((customerPrice * (1 - FREE_AGENT_DISCOUNT)).toFixed(2));
}

/**
 * Returns ALL bundle costs for an agent as { bundle_id, price }[].
 * Mirrors exactly what /api/bundles returns so the price list always matches.
 */
export async function getAllAgentBundleCosts(
  _registrationRef: string | null | undefined,
  agentType?: string | null,
  plan?: string | null
): Promise<{ bundle_id: string; price: number }[]> {
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

  // Pro plan agents: tier price if set, otherwise admin selling price (never Inventor cost)
  if (plan === "pro") {
    const { data: tierData } = await supabase.from("custom_tier_prices").select("bundle_id, price");
    const tierMap = new Map<string, number>((tierData ?? []).map((r: { bundle_id: string; price: number }) => [r.bundle_id, Number(r.price)]));

    for (const b of staticBundles) {
      const override = dbMap.get(b.id);
      if (override?.active === false) continue;
      const adminPrice = override?.price ?? b.price;
      result.push({ bundle_id: b.id, price: tierMap.get(b.id) ?? adminPrice });
    }
    for (const [id, { price, active }] of dbMap) {
      if (defaultIds.has(id)) continue;
      if (active === false) continue;
      result.push({ bundle_id: id, price: tierMap.get(id) ?? price });
    }
    return result;
  }

  // Free plan custom_price agents get 4% off; commission agents pay full price
  const discount = (agentType === "custom_price" && plan !== "pro") ? FREE_AGENT_DISCOUNT : 0;

  // Static bundles — include unless explicitly deactivated in DB
  for (const b of staticBundles) {
    const override = dbMap.get(b.id);
    if (override?.active === false) continue;
    const customerPrice = override?.price ?? b.price;
    result.push({ bundle_id: b.id, price: parseFloat((customerPrice * (1 - discount)).toFixed(2)) });
  }

  // Custom bundles (not in the static list) — include if active !== false
  for (const [id, { price, active }] of dbMap) {
    if (defaultIds.has(id)) continue;
    if (active === false) continue;
    result.push({ bundle_id: id, price: parseFloat((price * (1 - discount)).toFixed(2)) });
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
