import { describe, expect, it, vi } from "vitest";

// Supabase lookups fail here, so the router uses the default order:
// Yhang Mhany, SwiftData, Inventor.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/telegram", () => ({ sendAdminAlert: vi.fn(() => Promise.resolve()) }));

import { cleanSmartOrder, routeMtnOrder, type SupplierId } from "@/lib/supplier-router";

type Fake = {
  key?: boolean;
  balance?: number | null;
  listed?: "verified" | "not_verified" | "unknown";
  buy?: "ok" | "refused" | "unclear" | "not_on_list";
};

function fakes(spec: Partial<Record<SupplierId, Fake>>) {
  const bought: SupplierId[] = [];
  const make = (id: SupplierId) => {
    const f: Fake = { key: true, balance: 100, listed: "verified", buy: "ok", ...spec[id] };
    return {
      configured: () => f.key !== false,
      balance: async () => (f.balance === undefined ? 100 : f.balance),
      checkNumber: async () => f.listed ?? "verified",
      buy: async () => {
        bought.push(id);
        if (f.buy === "ok") return { ok: true as const, reference: `${id}-ref`, balanceAfter: null };
        return {
          ok: false as const,
          refused: f.buy !== "unclear",
          notOnList: f.buy === "not_on_list",
          body: { message: f.buy ?? "" },
        };
      },
    };
  };
  return {
    overrides: { yhangmhany: make("yhangmhany"), swiftdata: make("swiftdata"), inventor: make("inventor") },
    bought,
  };
}

const order = { reference: "ED-1", phone: "0241234567", sizeGB: 1, cost: 5 };

describe("smart supplier router", () => {
  it("buys from the first supplier when it has money and the number", async () => {
    const { overrides, bought } = fakes({});
    const out = await routeMtnOrder(order, overrides);
    expect(out).toMatchObject({ kind: "placed", supplier: "yhangmhany" });
    expect(bought).toEqual(["yhangmhany"]);
  });

  it("skips a supplier whose balance is below the order cost", async () => {
    const { overrides, bought } = fakes({ yhangmhany: { balance: 2 } });
    const out = await routeMtnOrder(order, overrides);
    expect(out).toMatchObject({ kind: "placed", supplier: "swiftdata" });
    expect(bought).toEqual(["swiftdata"]);
  });

  it("skips a supplier that doesn't have the number", async () => {
    const { overrides } = fakes({ yhangmhany: { listed: "not_verified" }, swiftdata: { listed: "not_verified" } });
    const out = await routeMtnOrder(order, overrides);
    expect(out).toMatchObject({ kind: "placed", supplier: "inventor" });
  });

  it("moves on after a clear refusal, but stops on an unclear failure", async () => {
    const refused = fakes({ yhangmhany: { buy: "refused" } });
    expect(await routeMtnOrder(order, refused.overrides)).toMatchObject({ kind: "placed", supplier: "swiftdata" });

    const unclear = fakes({ yhangmhany: { buy: "unclear" } });
    const out = await routeMtnOrder(order, unclear.overrides);
    expect(out).toMatchObject({ kind: "failed", supplier: "yhangmhany" });
    expect(unclear.bought).toEqual(["yhangmhany"]);
  });

  it("sends the order back for a top-up when money is the only problem", async () => {
    const { overrides, bought } = fakes({
      yhangmhany: { balance: 1 },
      swiftdata: { balance: 0 },
      inventor: { listed: "not_verified" },
    });
    expect(await routeMtnOrder(order, overrides)).toMatchObject({ kind: "needs_topup" });
    expect(bought).toEqual([]);
  });

  it("reports a new number when no supplier has it", async () => {
    const { overrides } = fakes({
      yhangmhany: { listed: "not_verified" },
      swiftdata: { listed: "not_verified" },
      inventor: { buy: "not_on_list", listed: "unknown" },
    });
    expect(await routeMtnOrder(order, overrides)).toMatchObject({ kind: "not_on_any_list" });
  });

  it("does not skip a supplier just because its balance can't be read", async () => {
    const { overrides } = fakes({ yhangmhany: { balance: null } });
    expect(await routeMtnOrder(order, overrides)).toMatchObject({ kind: "placed", supplier: "yhangmhany" });
  });

  it("skips suppliers with no API key", async () => {
    const some = fakes({ yhangmhany: { key: false } });
    expect(await routeMtnOrder(order, some.overrides)).toMatchObject({ kind: "placed", supplier: "swiftdata" });
    const none = fakes({ yhangmhany: { key: false }, swiftdata: { key: false }, inventor: { key: false } });
    expect(await routeMtnOrder(order, none.overrides)).toMatchObject({ kind: "no_supplier" });
  });

  it("cleans a saved order", () => {
    expect(cleanSmartOrder(["inventor", "bogus", "inventor"])).toEqual(["inventor", "yhangmhany", "swiftdata"]);
    expect(cleanSmartOrder(null)).toEqual(["yhangmhany", "swiftdata", "inventor"]);
  });
});
