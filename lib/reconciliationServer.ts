import "server-only";
import { supabase } from "@/lib/supabase";
import {
  reconcileOrders,
  type ReconciliationOrder,
  type ReconciliationPayment,
} from "@/lib/reconciliation";

export function reconciliationDayRange(reportDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("Invalid report date");
  const start = new Date(`${reportDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== reportDate) {
    throw new Error("Invalid report date");
  }
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function generateReconciliationSnapshot(reportDate: string) {
  const { start, end } = reconciliationDayRange(reportDate);
  const [ordersResult, paymentsResult, withdrawalsResult] = await Promise.all([
    supabase.from("orders")
      .select("reference,status,amount,cost_price,agent_commission,admin_commission,payment_method,paystack_reference,refunded,refund_amount,agent_id,agent_accounting_applied_at,fulfillment_started_at,completed_at,created_at,updated_at,phone,network,bundle_size", { count: "exact" })
      .is("archived_at", null)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase.from("payments")
      .select("id,amount,reference,status,created_at", { count: "exact" })
      .gte("created_at", start)
      .lt("created_at", end)
      .limit(10000),
    supabase.from("withdrawal_requests")
      .select("amount")
      .gte("processed_at", start)
      .lt("processed_at", end)
      .in("status", ["approved", "completed", "paid"]),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if ((ordersResult.count ?? 0) > (ordersResult.data?.length ?? 0)) {
    throw new Error("Daily order volume exceeded the reconciliation safety limit");
  }
  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  if ((paymentsResult.count ?? 0) > (paymentsResult.data?.length ?? 0)) {
    throw new Error("Daily payment volume exceeded the reconciliation safety limit");
  }
  if (withdrawalsResult.error) throw new Error(withdrawalsResult.error.message);

  const withdrawals = withdrawalsResult.data ?? [];
  const reconciliation = reconcileOrders((ordersResult.data ?? []) as ReconciliationOrder[], {
    payments: (paymentsResult.data ?? []) as ReconciliationPayment[],
    withdrawalCount: withdrawals.length,
    withdrawalAmount: withdrawals.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  });

  const snapshotPayload = {
    report_date: reportDate,
    period_start: start,
    period_end: end,
    currency: "GHS",
    metrics: reconciliation.metrics,
    issue_counts: reconciliation.issueCounts,
    issue_count: reconciliation.issueCount,
    risk_amount: reconciliation.riskAmount,
    status: reconciliation.status,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data: snapshot, error: snapshotError } = await supabase
    .from("financial_reconciliation_snapshots")
    .upsert(snapshotPayload, { onConflict: "report_date" })
    .select("*")
    .single();
  if (snapshotError) throw new Error(snapshotError.message);

  return { snapshot, issues: reconciliation.issues };
}
