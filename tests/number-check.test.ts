import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));

import {
  clearPassedCache,
  decide,
  orderedProviders,
  parseSettings,
  recallPassed,
  rememberPassed,
  safeHttpUrl,
  DEFAULT_SETTINGS,
  type Provider,
  type ProviderAnswer,
  type ProviderId,
} from "@/lib/number-check";

function fakeProviders(answers: Partial<Record<ProviderId, ProviderAnswer | "throws" | "unconfigured">>) {
  const calls: ProviderId[] = [];
  const make = (id: ProviderId): Provider => ({
    id,
    configured: () => answers[id] !== "unconfigured",
    check: async () => {
      calls.push(id);
      const a = answers[id] ?? "unknown";
      if (a === "throws") throw new Error("boom");
      return a as ProviderAnswer;
    },
  });
  return { lookup: { yhangmhany: make("yhangmhany"), inventor: make("inventor") }, calls };
}

beforeEach(() => clearPassedCache());

describe("provider order", () => {
  it("asks Yhang Mhany first by default and Inventor first when switched", () => {
    expect(orderedProviders("yhangmhany_first")).toEqual(["yhangmhany", "inventor"]);
    expect(orderedProviders("inventor_first")).toEqual(["inventor", "yhangmhany"]);
  });
});

describe("decide", () => {
  it("stops at the first provider that has the number", async () => {
    const { lookup, calls } = fakeProviders({ yhangmhany: "verified", inventor: "not_verified" });
    const out = await decide("0241234567", DEFAULT_SETTINGS, lookup);
    expect(out).toEqual({ status: "verified", allowed: true, provider: "yhangmhany" });
    expect(calls).toEqual(["yhangmhany"]); // Inventor is never asked
  });

  it("asks the second provider when the first does not have the number", async () => {
    const { lookup, calls } = fakeProviders({ yhangmhany: "not_verified", inventor: "verified" });
    const out = await decide("0241234567", DEFAULT_SETTINGS, lookup);
    expect(out).toEqual({ status: "verified", allowed: true, provider: "inventor" });
    expect(calls).toEqual(["yhangmhany", "inventor"]);
  });

  it("blocks a number that is on neither list", async () => {
    const { lookup } = fakeProviders({ yhangmhany: "not_verified", inventor: "not_verified" });
    const out = await decide("0249990000", DEFAULT_SETTINGS, lookup);
    expect(out).toMatchObject({ status: "not_verified", allowed: false, tried: ["yhangmhany", "inventor"] });
  });

  it("does not call a number new when one provider could not answer", async () => {
    const { lookup } = fakeProviders({ yhangmhany: "not_verified", inventor: "unknown" });
    const out = await decide("0249990000", DEFAULT_SETTINGS, lookup);
    expect(out.status).toBe("unreachable");
  });

  it("blocks when nothing answers and the policy is block", async () => {
    const { lookup } = fakeProviders({ yhangmhany: "unknown", inventor: "throws" });
    const out = await decide("0241234567", { ...DEFAULT_SETTINGS, onUnreachable: "block" }, lookup);
    expect(out).toMatchObject({ status: "unreachable", allowed: false });
  });

  it("lets the order through when nothing answers and the policy is allow", async () => {
    const { lookup } = fakeProviders({ yhangmhany: "unknown", inventor: "unknown" });
    const out = await decide("0241234567", { ...DEFAULT_SETTINGS, onUnreachable: "allow" }, lookup);
    expect(out).toMatchObject({ status: "unreachable", allowed: true });
  });

  it("treats a provider with no key as unreachable, never as a yes", async () => {
    const { lookup, calls } = fakeProviders({ yhangmhany: "unconfigured", inventor: "unconfigured" });
    const out = await decide("0241234567", DEFAULT_SETTINGS, lookup);
    expect(out).toMatchObject({ status: "unreachable", allowed: false });
    expect(calls).toEqual([]);
  });

  it("falls through to the second provider when the first has no key", async () => {
    const { lookup } = fakeProviders({ yhangmhany: "unconfigured", inventor: "verified" });
    const out = await decide("0241234567", DEFAULT_SETTINGS, lookup);
    expect(out).toEqual({ status: "verified", allowed: true, provider: "inventor" });
  });

  it("respects the switched order", async () => {
    const { lookup, calls } = fakeProviders({ yhangmhany: "verified", inventor: "verified" });
    await decide("0241234567", { ...DEFAULT_SETTINGS, order: "inventor_first" }, lookup);
    expect(calls).toEqual(["inventor"]);
  });
});

describe("settings", () => {
  it("falls back to safe defaults", () => {
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("reads the stored values", () => {
    const s = parseSettings([
      { key: "mtn_verification_enabled", value: "false" },
      { key: "number_check_order", value: "inventor_first" },
      { key: "number_check_unreachable", value: "allow" },
      { key: "number_check_cache_hours", value: "1" },
      { key: "verification_page_url", value: "https://example.com/add-number" },
    ]);
    expect(s).toEqual({ enabled: false, order: "inventor_first", onUnreachable: "allow", cacheHours: 1, verifyUrl: "https://example.com/add-number" });
  });

  it("only ever shows http(s) links to customers", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(parseSettings([{ key: "verification_page_url", value: "javascript:alert(1)" }]).verifyUrl).toBe("");
  });
});

describe("passed-number cache", () => {
  it("remembers a number until its time is up", () => {
    const t0 = 1_000_000;
    rememberPassed("0241234567", "inventor", 1, t0);
    expect(recallPassed("0241234567", t0 + 59 * 60_000)).toBe("inventor");
    expect(recallPassed("0241234567", t0 + 61 * 60_000)).toBeNull();
  });

  it("does not know a number it has not seen", () => {
    expect(recallPassed("0200000000")).toBeNull();
  });
});
