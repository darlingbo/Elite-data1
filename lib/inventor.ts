// Inventor DataHub API client
// Base URL: https://agent.inventor-datahub.com
// Set INVENTOR_API_BASE_URL and INVENTOR_API_KEY in environment variables.
// Never log or expose INVENTOR_API_KEY.

function base(): string {
  return (process.env.INVENTOR_API_BASE_URL ?? "https://agent.inventor-datahub.com").replace(/\/+$/, "");
}

function authHeader(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.INVENTOR_API_KEY ?? ""}`,
  };
}

export interface PurchaseResult {
  ok: boolean;
  balance: number | null;
  reference: string | null;
  body: Record<string, unknown>;
}

export interface VoucherResult {
  ok: boolean;
  body: Record<string, unknown>;
}

/** Purchase a data bundle. Returns ok=true when Inventor accepted the order. */
export async function inventorPurchase(
  network: string,
  phone: string,
  sizeGB: number,
  reference: string,
  timeoutMs = 25_000,
  maxRetries = 1,
): Promise<PurchaseResult> {
  let lastBody: Record<string, unknown> = {};

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
    try {
      const res = await fetch(`${base()}/api/developer/purchase`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ network, Phone: phone, Datasize: sizeGB, reference }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      lastBody = body;

      // Only retry on server-side 5xx errors
      if (res.status >= 500 && attempt < maxRetries) {
        continue;
      }

      const ok = res.ok && body.success === true;
      const data = (body.data as Record<string, unknown>) ?? {};
      const order = (data.order as Record<string, unknown>) ?? {};
      const balance = data.currentBalance !== undefined ? Number(data.currentBalance) : null;
      const providerReference = order.reference ?? data.reference;
      return {
        ok,
        balance: balance !== null && Number.isFinite(balance) ? balance : null,
        reference: typeof providerReference === "string" && providerReference ? providerReference : null,
        body,
      };
    } catch (err) {
      if (attempt === maxRetries) {
        return { ok: false, balance: null, reference: null, body: { error: String(err) } };
      }
    }
  }

  return { ok: false, balance: null, reference: null, body: lastBody };
}

/** Purchase a BECE or WASSCE voucher. */
export async function inventorVoucher(
  voucherType: string,
  recipient: string,
  quantity: number,
  timeoutMs = 15_000,
): Promise<VoucherResult> {
  try {
    const res = await fetch(`${base()}/api/developer/vouchers`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ voucherType, recipient, quantity }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok && body.success === true, body };
  } catch (err) {
    return { ok: false, body: { error: String(err) } };
  }
}

/** Fetch current wallet balance from Inventor. Returns null on error. */
export async function inventorBalance(): Promise<number | null> {
  try {
    const res = await fetch(`${base()}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY ?? ""}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const d = (data.data as Record<string, unknown>) ?? {};
    const raw = data.balance ?? d.balance ?? data.wallet_balance ?? d.wallet_balance ?? data.amount ?? d.amount ?? null;
    return raw !== null ? Number(raw) : null;
  } catch {
    return null;
  }
}

/** Verify MTN number eligibility before purchase. */
export async function inventorVerifyNumber(phone: string): Promise<{ verified: boolean; error?: string }> {
  try {
    const res = await fetch(`${base()}/api/developer/verify-number`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ phone, is_ported_number: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 503) return { verified: true }; // service down — let purchase decide
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const d = (data.data as Record<string, unknown>) ?? {};
    if (res.ok && data.success === true && d.exists === true) return { verified: true };
    return { verified: false, error: String(data.message ?? d.message ?? data.error ?? "Not on beneficiary list") };
  } catch {
    return { verified: true }; // network error — allow through
  }
}

/**
 * Strict three-way answer for the checkout number check.
 *
 * Unlike inventorVerifyNumber (which lets a number through whenever the
 * service is down), this tells a real "not on the list" apart from "could not
 * be reached", so the caller can apply the admin's chosen policy.
 *   verified     -> Inventor confirmed the number is on its beneficiary list
 *   not_verified -> Inventor answered and the number is not on the list
 *   unknown      -> no key, timeout, 5xx, rate limit, or any unclear answer
 */
export async function inventorNumberStatus(
  phone: string,
  isNotOnListMessage: (message: string) => boolean,
): Promise<"verified" | "not_verified" | "unknown"> {
  if (!process.env.INVENTOR_API_KEY?.trim()) return "unknown";
  try {
    const res = await fetch(`${base()}/api/developer/verify-number`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ phone, is_ported_number: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const d = (data.data as Record<string, unknown>) ?? {};
    if (res.ok && data.success === true && d.exists === true) return "verified";
    if (res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403) return "unknown";
    const message = String(data.message ?? d.message ?? data.error ?? "");
    return isNotOnListMessage(message) ? "not_verified" : "unknown";
  } catch {
    return "unknown";
  }
}
