import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the Supabase client and static bundles the pricing module imports ─────
const state: { bundlePrice: number | null; active: boolean | null; tierPrice: number | null } = {
  bundlePrice: 10,
  active: true,
  tierPrice: null,
};

function makeQuery(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  q.select = chain;
  q.eq = chain;
  q.maybeSingle = async () => {
    if (table === "bundle_prices") return { data: { price: state.bundlePrice, active: state.active }, error: null };
    if (table === "custom_tier_prices") return { data: state.tierPrice == null ? null : { price: state.tierPrice }, error: null };
    return { data: null, error: null };
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => makeQuery(table) },
}));
vi.mock("@/lib/bundles", () => ({ bundles: [{ id: "b1", price: 10 }] }));

import { getAgentBundleCost, FREE_AGENT_DISCOUNT } from "@/lib/agent-pricing";

beforeEach(() => {
  state.bundlePrice = 10;
  state.active = true;
  state.tierPrice = null;
});

describe("getAgentBundleCost", () => {
  it("commission agents pay the full customer price", async () => {
    expect(await getAgentBundleCost("b1", null, "commission")).toBe(10);
  });

  it("free custom_price agents get exactly the 4% discount", async () => {
    const cost = await getAgentBundleCost("b1", null, "custom_price", "free");
    expect(cost).toBeCloseTo(10 * (1 - FREE_AGENT_DISCOUNT), 5);
    expect(cost).toBe(9.6);
  });

  it("pro agents use the admin tier price when set", async () => {
    state.tierPrice = 7.5;
    expect(await getAgentBundleCost("b1", null, "custom_price", "pro")).toBe(7.5);
  });

  it("pro agents fall back to customer price when no tier price is set", async () => {
    state.tierPrice = null;
    expect(await getAgentBundleCost("b1", null, "custom_price", "pro")).toBe(10);
  });

  it("returns null for a deactivated bundle", async () => {
    state.active = false;
    expect(await getAgentBundleCost("b1", null, "commission")).toBeNull();
  });

  it("rounds the discounted price to 2 decimals", async () => {
    state.bundlePrice = 9.99;
    const cost = await getAgentBundleCost("b1", null, "custom_price", "free");
    expect(cost).toBe(Number((9.99 * 0.96).toFixed(2)));
  });
});
