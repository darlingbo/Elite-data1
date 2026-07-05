import { supabase } from "./supabase";
import { bundles as staticBundles } from "./bundles";

export const FREE_AGENT_DISCOUNT = 0.04; // 4% off customer price for FREE-plan price-mode agents

// "FREE" is the sentinel stored for Free-plan agents. null = Pro agent.
const isFreeRef = (ref: string | null | undefined) => ref === "FREE";

/**
 * Returns the wallet purchase cost for ONE bundle based on agent type + plan:
 *
 * - Commission agents   → full customer price (they earn 80% commission on profit via referrals)
 * - Price-mode FREE     → customer price × 0.96 (4% discount)
 * - Price-mode Pro      → custom_tier_prices (admin-set per-agent prices)
 */
export async function getAgentBundleCost(
  bundleId: string,
  registrationRef: string | null | undefined,
  agentType?: string | null
): Promise<number | null> {
  const customerPrice = await getCustomerPrice(bundleId);
  if (customerPrice == null) return null;

  // Commission agents pay the same price as regular customers
  if (agentType === "commission") return customerPrice;

  // Price-mode FREE plan: 4% off
  if (isFreeRef(registrationRef)) {
    return parseFloat((customerPrice * (1 - FREE_AGENT_DISCOUNT)).toFixed(2));
  }

  // Price-mode Pro: admin-set custom price
  const { data } = await supabase
    .from("custom_tier_prices")
    .select("price")
    .eq("bundle_id", bundleId)
    .maybeSingle();
  if (data?.price != null) return Number(data.price);

  // Fallback: full customer price if no tier price configured
  return customerPrice;
}

/**
 * Returns ALL bundle costs for an agent as { bundle_id, price }[].
 * Mirrors exactly what /api/bundles returns so the price list always matches.
 */
export async function getAllAgentBundleCosts(
  registrationRef: string | null | undefined,
  agentType?: string | null
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

  // Pro price-mode agents get custom_tier_prices
  if (agentType !== "commission" && !isFreeRef(registrationRef)) {
    const { data: tierData } = await supabase.from("custom_tier_prices").select("bundle_id, price");
    return (tierData ?? []).map((r: any) => ({ bundle_id: r.bundle_id, price: Number(r.price) }));
  }

  const result: { bundle_id: string; price: number }[] = [];
  const isCommission = agentType === "commission";
  const discount = isCommission ? 0 : FREE_AGENT_DISCOUNT; // commission = no discount

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
