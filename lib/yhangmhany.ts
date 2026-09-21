/**
 * Client for Yhang Mhany Bundles (bundles.yhangmhany.com) — an MTN-only
 * alternative to Inventor, switchable from Admin -> Network Providers
 * (system_settings.mtn_provider). Telecel and AirtelTigo always stay on
 * Inventor regardless of this setting.
 *
 * Mirrors inventorPurchase's return shape ({ok, balance, reference, body})
 * so order-approval.ts's branching stays minimal. Two real differences from
 * Inventor to design around:
 *
 * - Purchases are keyed by `bundleId`, not network + raw size — a purchase
 *   first needs a bundle lookup by size (GB) against their live catalogue,
 *   since their bundle IDs can change.
 * - No idempotency key of its own. A repeat purchase call for the same
 *   order creates and charges a SECOND real order. Callers must persist
 *   the returned reference (orders.yhangmhany_order_id) and use
 *   checkYhangMhanyOrder for any later status check — never purchase twice.
 *
 * Every purchase starts PROCESSING and is fulfilled by hand on their end,
 * resolved later via their webhook (app/api/webhooks/yhangmhany/route.ts)
 * or a checkYhangMhanyOrder poll.
 */

const BASE_URL = process.env.YHANGMHANY_BASE_URL ?? "https://bundles.yhangmhany.com";

function apiKey(): string {
  const key = process.env.YHANGMHANY_API_KEY;
  if (!key) throw new Error("YHANGMHANY_API_KEY is not set");
  return key;
}

async function yhmFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, json };
  } catch (e) {
    return { ok: false, json: { error: e instanceof Error ? e.message : "Could not reach Yhang Mhany" } };
  }
}

type YhmBundle = { bundleId: string; network: string; size_mb: number; price: number };

/** The plain "MTN" tier only -- deliberately excludes "MTN (Unverified
 * Num)", their much pricier fallback tier. Not something to silently
 * upgrade a customer into without being asked. */
async function findMtnBundle(sizeGB: number): Promise<YhmBundle | null> {
  const { ok, json } = await yhmFetch("/api/v1/bundles");
  if (!ok || json.success !== true) return null;
  const bundles = (json.bundles as YhmBundle[] | undefined) ?? [];
  const targetMb = Math.round(sizeGB * 1000);
  return bundles.find((b) => b.network === "MTN" && b.size_mb === targetMb) ?? null;
}

export type PurchaseResult = {
  ok: boolean;
  balance: number | null;
  reference: string | null;
  body: Record<string, unknown>;
};

/** Create a brand-new order. See the module doc -- never call this twice for
 * the same Elite Data order; check for a stored yhangmhany_order_id first. */
export async function yhangmhanyPurchase(phone: string, sizeGB: number): Promise<PurchaseResult> {
  const bundle = await findMtnBundle(sizeGB);
  if (!bundle) {
    return { ok: false, balance: null, reference: null, body: { message: `No matching MTN ${sizeGB}GB bundle on Yhang Mhany` } };
  }

  const { ok, json } = await yhmFetch("/api/v1/purchase", {
    method: "POST",
    body: JSON.stringify({ bundleId: bundle.bundleId, recipientNumber: phone }),
  });
  if (!ok || json.success !== true) {
    return { ok: false, balance: null, reference: null, body: json };
  }
  const order = (json.order as Record<string, unknown>) ?? {};
  return {
    ok: true,
    balance: null,
    reference: typeof order.id === "string" ? order.id : null,
    body: json,
  };
}

export type StatusResult = { status: "PROCESSING" | "DELIVERED" | "REJECTED" | "UNKNOWN" };

/** Poll an existing order -- safe to call as many times as needed. */
export async function checkYhangMhanyOrder(orderId: string): Promise<StatusResult> {
  const { ok, json } = await yhmFetch(`/api/v1/orders?id=${encodeURIComponent(orderId)}`);
  if (!ok || json.success !== true) return { status: "UNKNOWN" };
  const order = (json.order as Record<string, unknown>) ?? {};
  const status = String(order.status ?? "").toUpperCase();
  if (status === "DELIVERED" || status === "REJECTED" || status === "PROCESSING") {
    return { status: status as StatusResult["status"] };
  }
  return { status: "UNKNOWN" };
}

/** Our remaining wallet balance on Yhang Mhany. */
export async function yhangMhanyBalance(): Promise<number | null> {
  const { ok, json } = await yhmFetch("/api/v1/balance");
  if (!ok || json.success !== true) return null;
  const data = (json.data as Record<string, unknown>) ?? {};
  return typeof data.balance === "number" ? data.balance : null;
}
