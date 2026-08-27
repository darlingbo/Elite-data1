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
): Promise<PurchaseResult> {
  try {
    const res = await fetch(`${base()}/api/developer/purchase`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ network, Phone: phone, Datasize: sizeGB, reference }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
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
    return { ok: false, balance: null, reference: null, body: { error: String(err) } };
  }
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
