/**
 * Client for SwiftData's reseller API, an MTN option in the supplier switch
 * (Admin -> Network Providers, system_settings.mtn_provider = "swiftdata").
 * Telecel and AirtelTigo stay on Inventor whatever the switch says.
 *
 * SwiftData calls MTN "yello". Every purchase is sent with OUR order
 * reference as SwiftData's `reference`. They refuse a reference they have
 * already seen, so a repeat purchase can never charge us twice, and the
 * order's status can always be looked up with our own reference. No new
 * database column is needed.
 *
 * Orders start pending/processing. SwiftData sends no webhook, so the
 * sync-orders cron polls GET /v1/orders/{reference} until it's completed or
 * failed.
 *
 * The key is only read from SWIFTDATA_API_KEY. It is never logged or returned.
 */

const BASE_URL = (process.env.SWIFTDATA_BASE_URL ?? "https://ihrvvniomtoofrjkmalb.supabase.co/functions/v1/api").replace(/\/+$/, "");

function apiKey(): string {
  const key = process.env.SWIFTDATA_API_KEY?.trim();
  if (!key) throw new Error("SWIFTDATA_API_KEY is not set");
  return key;
}

export function isSwiftDataConfigured(): boolean {
  return !!process.env.SWIFTDATA_API_KEY?.trim();
}

async function sdFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { error: e instanceof Error ? e.message : "Could not reach SwiftData" } };
  }
}

function errorText(json: Record<string, unknown>): string {
  return String(json.error ?? json.message ?? "").slice(0, 200);
}

export type SwiftDataVerify = "verified" | "not_verified" | "unknown";

/** Is this MTN number on SwiftData's beneficiary list? Only a clear answer
 * counts. A timeout or error is "unknown", never "not verified". */
export async function swiftdataVerifyNumber(phone: string): Promise<SwiftDataVerify> {
  if (!isSwiftDataConfigured()) return "unknown";
  const { ok, json } = await sdFetch("/v1/verify-number", {
    method: "POST",
    body: JSON.stringify({ phone }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!ok || json.success !== true) return "unknown";
  const first = ((json.results as Record<string, unknown>[] | undefined) ?? [])[0] ?? {};
  const status = String(first.status ?? "").toLowerCase();
  if (first.verified === true || status === "verified") return "verified";
  if (status === "unverified" || status === "submitted" || status === "invalid") return "not_verified";
  return "unknown";
}

export type SwiftDataPurchase = {
  ok: boolean;
  reference: string | null;
  /** True when SwiftData clearly refused: nothing was bought, nothing charged. */
  definitelyNotTaken: boolean;
  body: Record<string, unknown>;
};

/** Buy an MTN bundle. `reference` must be our own order reference. */
export async function swiftdataPurchase(phone: string, sizeGB: number, reference: string): Promise<SwiftDataPurchase> {
  const { ok, status, json } = await sdFetch("/v1/buy-data", {
    method: "POST",
    body: JSON.stringify({ phone, network: "yello", size_gb: sizeGB, reference }),
  });

  if (ok && json.success === true) {
    const order = (json.order as Record<string, unknown>) ?? {};
    return { ok: true, reference: typeof order.reference === "string" ? order.reference : reference, definitelyNotTaken: false, body: json };
  }

  const message = errorText(json);
  // SwiftData already has an order with this reference: an earlier attempt
  // went through. Treat it as placed and let the status poll finish it.
  if (/duplicate|already/i.test(message)) {
    return { ok: true, reference, definitelyNotTaken: false, body: json };
  }

  // A 4xx with a message is a clear refusal (bad number, no such size,
  // insufficient balance). A timeout, 5xx or empty reply is ambiguous: the
  // order may exist, so it is never retried anywhere else.
  const definitelyNotTaken = status >= 400 && status < 500 && status !== 408 && status !== 429 && message.length > 0;
  return { ok: false, reference: null, definitelyNotTaken, body: { message: message || "SwiftData purchase failed", ...json } };
}

export type SwiftDataStatus = "completed" | "processing" | "failed" | null;

/** Poll an order. Safe to call any number of times. */
export async function checkSwiftDataOrder(reference: string): Promise<SwiftDataStatus> {
  if (!isSwiftDataConfigured()) return null;
  const { ok, json } = await sdFetch(`/v1/orders/${encodeURIComponent(reference)}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!ok || json.success !== true) return null;
  const order = (json.order as Record<string, unknown>) ?? {};
  const status = String(order.status ?? "").toLowerCase();
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "pending" || status === "processing") return "processing";
  return null;
}

/** Our SwiftData wallet balance in GHS, or null when unreachable/not set up. */
export async function swiftdataBalance(): Promise<number | null> {
  if (!isSwiftDataConfigured()) return null;
  const { ok, json } = await sdFetch("/v1/balance", { signal: AbortSignal.timeout(8_000) });
  if (!ok || json.success !== true) return null;
  const bal = Number(json.balance);
  return Number.isFinite(bal) ? bal : null;
}
