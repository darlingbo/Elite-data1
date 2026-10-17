import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Paystack is gone ─────────────────────────────────────────────────────────
// Payment is Mobile Money through Yebeck only. These checks stop Paystack
// (or a card option) creeping back into the code.

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "tests", "supabase", "backend", "netlify", "n8n-workflows", "public"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe("no Paystack in the code", () => {
  const files = ["app", "components", "lib"].flatMap((d) => sourceFiles(join(ROOT, d))).concat(join(ROOT, "proxy.ts"));

  it("never calls the Paystack API or loads its script", () => {
    const offenders = files.filter((f) => /api\.paystack\.co|js\.paystack\.co|checkout\.paystack\.com|PaystackPop|PAYSTACK_(SECRET|PUBLIC)_KEY/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });

  it("has no Paystack route left", () => {
    const routes = files.filter((f) => /[\\/]app[\\/]api[\\/]/.test(f) && /paystack/i.test(f));
    expect(routes.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });

  it("keeps Paystack out of the content security policy", () => {
    const csp = readFileSync(join(ROOT, "proxy.ts"), "utf8");
    expect(csp).not.toMatch(/paystack/i);
  });
});

// ── A payment can only be spent on what it was made for ──────────────────────
type Attempt = { reference: string; amount_pesewas: number; status: string; payment_type: string; metadata: Record<string, unknown>; created_at: string; updated_at: string };

async function loadWith(attempt: Attempt) {
  vi.resetModules();
  vi.doMock("@/lib/supabase", () => ({
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: JSON.stringify({ [attempt.reference]: attempt }) } }) }) }),
        upsert: async () => ({ error: null }),
      }),
    },
  }));
  vi.doMock("@/lib/yebeck", () => ({
    getCollection: async () => ({ status: "success" }),
    normalizeCollectionStatus: (s: string) => s,
  }));
  return import("@/lib/payment-attempt");
}

const attempt = (type: string): Attempt => ({
  reference: "YBK-123456",
  amount_pesewas: 1000,
  status: "success",
  payment_type: type,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe("verifyYebeckPayment purpose check", () => {
  beforeEach(() => vi.resetModules());

  it("accepts a payment used for the thing it was made for", async () => {
    const { verifyYebeckPayment } = await loadWith(attempt("topup"));
    const result = await verifyYebeckPayment("YBK-123456", "topup");
    expect(result.status).toBe("success");
  });

  it("refuses a wallet top-up being spent on a data order", async () => {
    const { verifyYebeckPayment } = await loadWith(attempt("topup"));
    await expect(verifyYebeckPayment("YBK-123456", "data_order")).rejects.toThrow(/made for something else/);
  });

  it("refuses a data-order payment being spent on a wallet top-up", async () => {
    const { verifyYebeckPayment } = await loadWith(attempt("data_order"));
    await expect(verifyYebeckPayment("YBK-123456", "topup")).rejects.toThrow(/made for something else/);
  });

  it("still works without an expected type (admin recovery tools)", async () => {
    const { verifyYebeckPayment } = await loadWith(attempt("voucher_order"));
    const result = await verifyYebeckPayment("YBK-123456");
    expect(result.attempt.payment_type).toBe("voucher_order");
  });
});
