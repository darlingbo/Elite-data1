export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toMinorUnits(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function fromMinorUnits(value: number): number {
  return roundCurrency((Number.isFinite(value) ? value : 0) / 100);
}

export function addCurrency(...values: number[]): number {
  return fromMinorUnits(values.reduce((total, value) => total + toMinorUnits(value), 0));
}

export function subtractCurrency(value: number, ...subtrahends: number[]): number {
  return fromMinorUnits(
    subtrahends.reduce((total, subtrahend) => total - toMinorUnits(subtrahend), toMinorUnits(value)),
  );
}

export function multiplyCurrency(value: number, multiplier: number): number {
  if (!Number.isFinite(multiplier)) return 0;
  return roundCurrency(value * multiplier);
}

export function divideCurrency(value: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new RangeError("Currency divisor must be a finite non-zero number.");
  }
  return roundCurrency(value / divisor);
}

export function percentageOf(value: number, rate: number): number {
  return multiplyCurrency(value, rate);
}

export function formatCurrency(value: number): string {
  return `GH₵${roundCurrency(value).toFixed(2)}`;
}

export function safeNumber(value: number | string | null | undefined): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? roundCurrency(numeric) : 0;
}

export interface UnifiedTransaction {
  id: string;
  kind: string;
  title: string;
  amount: number;
  description: string;
  created_at: string;
  source: string;
  reference?: string | null;
  note?: string | null;
  balance_after?: number | null;
  direction: "in" | "out" | "neutral";
}

export function buildUnifiedTransactions({
  ledgerEntries = [],
  walletTransactions = [],
  agentWalletTransactions = [],
}: {
  ledgerEntries?: Array<{
    id?: string;
    type?: string;
    amount?: number | string | null;
    balance_after?: number | string | null;
    note?: string | null;
    order_reference?: string | null;
    recorded_at?: string | null;
  }>;
  walletTransactions?: Array<{
    id?: string;
    type?: string;
    amount?: number | string | null;
    description?: string | null;
    reference?: string | null;
    balance_after?: number | string | null;
    created_at?: string | null;
  }>;
  agentWalletTransactions?: Array<{
    id?: string;
    type?: string;
    amount?: number | string | null;
    description?: string | null;
    paystack_reference?: string | null;
    created_at?: string | null;
  }>;
}): UnifiedTransaction[] {
  const asTransaction = (
    input: UnifiedTransaction,
  ): UnifiedTransaction => ({
    ...input,
    amount: safeNumber(input.amount),
  });

  const ledgerTxs = ledgerEntries.map((entry) => {
    const type = String(entry.type ?? "snapshot").toLowerCase();
    const kind = type === "deposit" ? "deposit" : type === "deduction" ? "deduction" : "snapshot";
    const title = type === "deposit"
      ? "Ledger deposit"
      : type === "deduction"
        ? "Ledger deduction"
        : "Balance snapshot";

    return asTransaction({
      id: entry.id ?? `ledger-${entry.recorded_at ?? Math.random()}`,
      kind,
      title,
      amount: safeNumber(entry.amount),
      description: entry.note ?? title,
      created_at: entry.recorded_at ?? new Date().toISOString(),
      source: "ledger",
      reference: entry.order_reference ?? null,
      note: entry.note ?? null,
      balance_after: entry.balance_after !== undefined ? safeNumber(entry.balance_after) : null,
      direction: kind === "deposit" ? "in" : kind === "deduction" ? "out" : "neutral",
    });
  });

  const apiWalletTxs = walletTransactions.map((entry) => {
    const type = String(entry.type ?? "credit").toLowerCase();
    const kind = type === "credit" ? "wallet-topup" : "wallet-debit";
    const title = type === "credit" ? "API wallet top-up" : "API wallet debit";
    return asTransaction({
      id: entry.id ?? `api-wallet-${entry.created_at ?? Math.random()}`,
      kind,
      title,
      amount: safeNumber(entry.amount),
      description: entry.description ?? title,
      created_at: entry.created_at ?? new Date().toISOString(),
      source: "api-wallet",
      reference: entry.reference ?? null,
      note: entry.description ?? null,
      balance_after: entry.balance_after !== undefined ? safeNumber(entry.balance_after) : null,
      direction: type === "credit" ? "in" : "out",
    });
  });

  const agentWalletTxs = agentWalletTransactions.map((entry) => {
    const type = String(entry.type ?? "unknown").toLowerCase();
    const kindMap: Record<string, string> = {
      commission: "commission",
      withdrawal: "withdrawal",
      refund: "refund",
      order_debit: "order-debit",
      orderdebit: "order-debit",
      admin_credit: "admin-credit",
      admin_debit: "admin-debit",
    };
    const kind = kindMap[type] ?? type;
    const titleMap: Record<string, string> = {
      commission: "Agent commission",
      withdrawal: "Agent withdrawal",
      refund: "Refund",
      "order-debit": "Agent purchase debit",
      "admin-credit": "Admin credit",
      "admin-debit": "Admin debit",
    };
    const title = titleMap[kind] ?? "Agent wallet event";
    const direction = kind === "withdrawal" || kind === "order-debit" || kind === "admin-debit"
      ? "out"
      : kind === "commission" || kind === "refund" || kind === "admin-credit"
        ? "in"
        : "neutral";

    return asTransaction({
      id: entry.id ?? `agent-wallet-${entry.created_at ?? Math.random()}`,
      kind,
      title,
      amount: safeNumber(entry.amount),
      description: entry.description ?? title,
      created_at: entry.created_at ?? new Date().toISOString(),
      source: "agent-wallet",
      reference: entry.paystack_reference ?? null,
      note: entry.description ?? null,
      direction,
    });
  });

  return [...ledgerTxs, ...apiWalletTxs, ...agentWalletTxs].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
