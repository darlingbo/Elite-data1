export type ReconciliationStatus = "balanced" | "review" | "critical";

export type ReconciliationIssueType =
  | "missing_payment_evidence"
  | "duplicate_payment_reference"
  | "orphan_payment"
  | "stuck_payment_claim"
  | "payment_order_mismatch"
  | "refund_exposure"
  | "negative_margin"
  | "missing_cost"
  | "delivery_unknown"
  | "stuck_processing"
  | "failed_with_accounting"
  | "completed_missing_accounting"
  | "profit_mismatch";

export interface ReconciliationOrder {
  reference: string;
  status: string;
  amount: number | string | null;
  cost_price: number | string | null;
  agent_commission: number | string | null;
  admin_commission: number | string | null;
  payment_method: string | null;
  paystack_reference: string | null;
  refunded: boolean | null;
  refund_amount: number | string | null;
  agent_id: string | null;
  agent_accounting_applied_at: string | null;
  fulfillment_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
  phone: string | null;
  network: string | null;
  bundle_size: string | null;
}

export interface ReconciliationPayment {
  id: string;
  amount: number | string | null;
  reference: string | null;
  status: string | null;
  created_at: string;
}

export interface ReconciliationIssue {
  id: string;
  type: ReconciliationIssueType;
  severity: "review" | "critical";
  reference: string;
  title: string;
  detail: string;
  amount: number;
  createdAt: string;
}

export interface ReconciliationMetrics {
  orderCount: number;
  grossOrderValue: number;
  paystackConfirmedCount: number;
  paystackConfirmedValue: number;
  internalPaymentCount: number;
  internalPaymentValue: number;
  unverifiedPaymentCount: number;
  unverifiedPaymentValue: number;
  paymentTableConfirmedRows: number;
  completedCount: number;
  completedRevenue: number;
  providerCost: number;
  agentCommissions: number;
  expectedProfit: number;
  recordedAdminProfit: number;
  refundedCount: number;
  refundedAmount: number;
  refundExposureCount: number;
  refundExposureAmount: number;
  pendingApprovalCount: number;
  pendingApprovalAmount: number;
  withdrawalCount: number;
  withdrawalAmount: number;
}

export interface ReconciliationResult {
  metrics: ReconciliationMetrics;
  issueCounts: Record<ReconciliationIssueType, number>;
  issues: ReconciliationIssue[];
  issueCount: number;
  riskAmount: number;
  status: ReconciliationStatus;
}

const INTERNAL_REFERENCE = /^(AGTWALLET-|MNL-|API-|compensate-)/i;
const LEGACY_BULK_REFERENCE = /^elite-bulk-\d+-\d{2}$/i;
const INTERNAL_METHODS = new Set(["wallet", "agent_wallet", "manual", "api"]);

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function paymentEvidence(order: ReconciliationOrder): "paystack" | "internal" | "missing" {
  if (order.paystack_reference) return "paystack";
  if (LEGACY_BULK_REFERENCE.test(order.reference ?? "")) return "paystack";
  if (
    INTERNAL_REFERENCE.test(order.reference ?? "") ||
    INTERNAL_METHODS.has((order.payment_method ?? "").toLowerCase())
  ) return "internal";
  return money(order.amount) > 0 ? "missing" : "internal";
}

export function reconcileOrders(
  orders: ReconciliationOrder[],
  options: {
    paymentTableConfirmedRows?: number;
    payments?: ReconciliationPayment[];
    withdrawalCount?: number;
    withdrawalAmount?: number;
    now?: Date;
  } = {}
): ReconciliationResult {
  const now = options.now ?? new Date();
  const issues: ReconciliationIssue[] = [];
  const issueCounts = {
    missing_payment_evidence: 0,
    duplicate_payment_reference: 0,
    orphan_payment: 0,
    stuck_payment_claim: 0,
    payment_order_mismatch: 0,
    refund_exposure: 0,
    negative_margin: 0,
    missing_cost: 0,
    delivery_unknown: 0,
    stuck_processing: 0,
    failed_with_accounting: 0,
    completed_missing_accounting: 0,
    profit_mismatch: 0,
  } satisfies Record<ReconciliationIssueType, number>;

  const metrics: ReconciliationMetrics = {
    orderCount: orders.length,
    grossOrderValue: 0,
    paystackConfirmedCount: 0,
    paystackConfirmedValue: 0,
    internalPaymentCount: 0,
    internalPaymentValue: 0,
    unverifiedPaymentCount: 0,
    unverifiedPaymentValue: 0,
    paymentTableConfirmedRows: options.paymentTableConfirmedRows ?? options.payments?.length ?? 0,
    completedCount: 0,
    completedRevenue: 0,
    providerCost: 0,
    agentCommissions: 0,
    expectedProfit: 0,
    recordedAdminProfit: 0,
    refundedCount: 0,
    refundedAmount: 0,
    refundExposureCount: 0,
    refundExposureAmount: 0,
    pendingApprovalCount: 0,
    pendingApprovalAmount: 0,
    withdrawalCount: options.withdrawalCount ?? 0,
    withdrawalAmount: round(options.withdrawalAmount ?? 0),
  };

  const paymentReferences = new Map<string, ReconciliationOrder[]>();
  const riskByOrder = new Map<string, number>();

  const addIssue = (
    source: Pick<ReconciliationOrder, "reference" | "created_at">,
    type: ReconciliationIssueType,
    severity: "review" | "critical",
    title: string,
    detail: string,
    amount = 0,
  ) => {
    issueCounts[type] += 1;
    const roundedAmount = round(amount);
    if (severity === "critical" && roundedAmount > 0) {
      riskByOrder.set(
        source.reference,
        Math.max(riskByOrder.get(source.reference) ?? 0, roundedAmount),
      );
    }
    issues.push({
      id: `${type}:${source.reference}`,
      type,
      severity,
      reference: source.reference,
      title,
      detail,
      amount: roundedAmount,
      createdAt: source.created_at,
    });
  };

  for (const order of orders) {
    const amount = money(order.amount);
    const cost = money(order.cost_price);
    const agentCommission = money(order.agent_commission);
    const adminCommission = money(order.admin_commission);
    const status = (order.status ?? "").toLowerCase();
    const evidence = paymentEvidence(order);
    metrics.grossOrderValue += amount;

    if (evidence === "paystack") {
      metrics.paystackConfirmedCount += 1;
      metrics.paystackConfirmedValue += amount;
      const list = paymentReferences.get(order.paystack_reference!) ?? [];
      list.push(order);
      paymentReferences.set(order.paystack_reference!, list);
    } else if (evidence === "internal") {
      metrics.internalPaymentCount += 1;
      metrics.internalPaymentValue += amount;
    } else {
      metrics.unverifiedPaymentCount += 1;
      metrics.unverifiedPaymentValue += amount;
      addIssue(
        order,
        "missing_payment_evidence",
        "critical",
        "Payment evidence missing",
        "No Paystack reference or recognised wallet/manual/API source is attached.",
        amount,
      );
    }

    if (status === "completed") {
      metrics.completedCount += 1;
      metrics.completedRevenue += amount;
      metrics.providerCost += cost;
      metrics.agentCommissions += agentCommission;
      metrics.expectedProfit += amount - cost - agentCommission;
      metrics.recordedAdminProfit += adminCommission;

      if (amount > 0 && cost <= 0) {
        addIssue(order, "missing_cost", "review", "Provider cost missing", "Profit cannot be trusted until a cost price is recorded.");
      }
      if (amount > 0 && cost + agentCommission > amount) {
        const loss = cost + agentCommission - amount;
        addIssue(order, "negative_margin", "critical", "Order sold at a loss", "Cost and commission exceed the customer amount.", loss);
      }
      if (
        order.admin_commission !== null &&
        Math.abs(adminCommission - (amount - cost - agentCommission)) >
          (evidence === "paystack" ? Math.max(0.05, amount * 0.03) : 0.05)
      ) {
        addIssue(
          order,
          "profit_mismatch",
          "review",
          "Recorded profit needs review",
          "Recorded admin profit materially differs from gross margin after allowing for normal Paystack fees.",
        );
      }
      if (
        order.agent_id &&
        order.completed_at &&
        !order.agent_accounting_applied_at
      ) {
        addIssue(order, "completed_missing_accounting", "review", "Agent accounting missing", "The order completed without an accounting timestamp.", agentCommission);
      }
    }

    if (order.refunded) {
      metrics.refundedCount += 1;
      metrics.refundedAmount += money(order.refund_amount) || amount;
    }

    if (
      ["failed", "rejected", "delivery_unknown"].includes(status) &&
      !order.refunded &&
      amount > 0
    ) {
      metrics.refundExposureCount += 1;
      metrics.refundExposureAmount += amount;
      addIssue(order, "refund_exposure", "critical", "Possible refund owed", "The order did not complete and no refund is recorded.", amount);
    }

    if (status === "pending_approval") {
      metrics.pendingApprovalCount += 1;
      metrics.pendingApprovalAmount += amount;
    }

    if (status === "delivery_unknown") {
      addIssue(order, "delivery_unknown", "critical", "Delivery result unknown", "Confirm with the provider before attempting another delivery.", amount);
    }

    const processingSince = order.fulfillment_started_at ?? order.updated_at ?? order.created_at;
    if (
      status === "processing" &&
      now.getTime() - new Date(processingSince).getTime() > 30 * 60_000
    ) {
      addIssue(order, "stuck_processing", "review", "Order stuck processing", "Processing has exceeded 30 minutes.");
    }

    if (
      ["failed", "rejected", "delivery_unknown"].includes(status) &&
      order.agent_accounting_applied_at
    ) {
      addIssue(order, "failed_with_accounting", "critical", "Commission credited on unsuccessful order", "Review the agent accounting before any payout.", agentCommission);
    }
  }

  for (const [reference, matchingOrders] of paymentReferences) {
    if (matchingOrders.length < 2) continue;
    const validBulkGroup = matchingOrders.every((order) =>
      (order.payment_method ?? "").toLowerCase() === "paystack_bulk" &&
      order.reference.startsWith(`${reference}-`)
    );
    if (validBulkGroup) continue;
    for (const duplicate of matchingOrders.slice(1)) {
      addIssue(
        duplicate,
        "duplicate_payment_reference",
        "critical",
        "Duplicate Paystack reference",
        `Payment reference ${reference} appears on ${matchingOrders.length} orders.`,
        money(duplicate.amount),
      );
    }
  }

  for (const payment of options.payments ?? []) {
    const reference = payment.reference?.trim();
    if (!reference) continue;
    const matchingOrders = paymentReferences.get(reference) ?? [];
    const status = (payment.status ?? "").toLowerCase();
    const ageMs = now.getTime() - new Date(payment.created_at).getTime();
    const paymentSource = { reference, created_at: payment.created_at };

    if (
      matchingOrders.length === 0 &&
      (status !== "processing" || ageMs > 30 * 60_000)
    ) {
      addIssue(
        paymentSource,
        "orphan_payment",
        "critical",
        "Verified payment has no orders",
        "This payment was claimed but no matching order was safely recorded. Do not charge or deliver again until it is reviewed.",
        money(payment.amount),
      );
      continue;
    }

    if (status !== "processing" && matchingOrders.length > 0) {
      const recordedOrderValue = matchingOrders.reduce(
        (sum, order) => sum + money(order.amount),
        0,
      );
      const variance = Math.abs(money(payment.amount) - recordedOrderValue);
      const roundingAllowance = Math.max(0.1, money(payment.amount) * 0.005);
      if (variance > roundingAllowance) {
        addIssue(
          paymentSource,
          "payment_order_mismatch",
          "critical",
          "Paid amount and queued orders differ",
          "The verified bulk payment does not match the value of the orders saved for approval. Review before approving or refunding.",
          variance,
        );
      }
    }

    if (status === "processing" && ageMs > 30 * 60_000) {
      const accountedAmount = matchingOrders.reduce((sum, order) => {
        const orderStatus = (order.status ?? "").toLowerCase();
        if (orderStatus === "completed") return sum + money(order.amount);
        if (order.refunded) return sum + (money(order.refund_amount) || money(order.amount));
        return sum;
      }, 0);
      const exposure = Math.max(0, money(payment.amount) - accountedAmount);
      if (exposure > 0) {
        addIssue(
          paymentSource,
          "stuck_payment_claim",
          "critical",
          "Paid bulk order did not finish",
          "The payment claim has been processing for over 30 minutes. Review undelivered numbers before retrying.",
          exposure,
        );
      }
    }
  }

  const numericMetrics = metrics as unknown as Record<string, number>;
  for (const key of Object.keys(numericMetrics)) {
    numericMetrics[key] = round(numericMetrics[key]);
  }

  // A single order can trigger several warnings. Count its largest financial
  // exposure once so the headline risk total never exaggerates the money at risk.
  const riskAmount = round(
    [...riskByOrder.values()].reduce((sum, amount) => sum + amount, 0),
  );
  const issueCount = issues.length;
  const status: ReconciliationStatus =
    riskAmount > 0 || issues.some((issue) => issue.severity === "critical")
      ? "critical"
      : issueCount > 0 ? "review" : "balanced";

  issues.sort((a, b) =>
    Number(b.severity === "critical") - Number(a.severity === "critical") ||
    b.amount - a.amount ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return { metrics, issueCounts, issues, issueCount, riskAmount, status };
}
