"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReconciliationIssue, ReconciliationIssueType, ReconciliationMetrics } from "@/lib/reconciliation";

type Snapshot = {
  id: string;
  report_date: string;
  status: "balanced" | "review" | "critical";
  issue_count: number;
  risk_amount: number;
  metrics: ReconciliationMetrics;
  issue_counts: Record<ReconciliationIssueType, number>;
  generated_at: string;
};

type HistoryRow = Pick<Snapshot, "id" | "report_date" | "status" | "issue_count" | "risk_amount" | "metrics" | "generated_at">;

type ReportResponse = {
  snapshot: Snapshot;
  issues: ReconciliationIssue[];
  history: HistoryRow[];
  methodology: { timezone: string; paymentEvidence: string; expectedProfit: string; note: string };
};

const issueLabels: Record<ReconciliationIssueType, string> = {
  missing_payment_evidence: "Missing payment",
  duplicate_payment_reference: "Duplicate payment",
  orphan_payment: "Payment without orders",
  stuck_payment_claim: "Stuck paid bulk order",
  payment_order_mismatch: "Payment/order mismatch",
  refund_exposure: "Possible refund",
  negative_margin: "Negative margin",
  missing_cost: "Missing cost",
  delivery_unknown: "Unknown delivery",
  stuck_processing: "Stuck processing",
  failed_with_accounting: "Failed but credited",
  completed_missing_accounting: "Missing accounting",
  profit_mismatch: "Profit mismatch",
};

function ghs(value: number | string | null | undefined) {
  return `GHS ${Number(value ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusStyle(status: Snapshot["status"]) {
  if (status === "critical") return { label: "Action required", color: "#fca5a5", bg: "rgba(239,68,68,.12)", border: "rgba(239,68,68,.3)" };
  if (status === "review") return { label: "Review", color: "#fcd34d", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.3)" };
  return { label: "Balanced", color: "#6ee7b7", bg: "rgba(16,185,129,.1)", border: "rgba(16,185,129,.25)" };
}

export default function FinancialReconciliation() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [filter, setFilter] = useState<ReconciliationIssueType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (reportDate: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/reconciliation?date=${encodeURIComponent(reportDate)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not generate reconciliation report");
      setReport(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate reconciliation report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(date); }, 0);
    return () => window.clearTimeout(timer);
  }, [date, load]);

  const displayedIssues = useMemo(() =>
    report?.issues.filter((issue) => filter === "all" || issue.type === filter) ?? [],
    [filter, report]
  );

  if (loading && !report) {
    return <div className="flex items-center justify-center py-28"><div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;
  }

  const metrics = report?.snapshot.metrics;
  const state = report ? statusStyle(report.snapshot.status) : null;
  const evidenceTotal = Number(metrics?.grossOrderValue ?? 0);
  const evidenceCovered = Number(metrics?.paystackConfirmedValue ?? 0) + Number(metrics?.internalPaymentValue ?? 0);
  const evidencePct = evidenceTotal > 0 ? Math.min(100, (evidenceCovered / evidenceTotal) * 100) : 100;

  return (
    <div className="admin-section space-y-5">
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          {state && <span className="rounded-full border px-3 py-1.5 text-xs font-black" style={{ color: state.color, background: state.bg, borderColor: state.border }}>{state.label}</span>}
          {report && <span className="text-xs text-slate-500">Generated {new Date(report.snapshot.generated_at).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input aria-label="Reconciliation date" type="date" value={date} max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-xl border px-3 py-2.5 text-white" />
          <button onClick={() => void load(date)} disabled={loading}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50">
            {loading ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-300">{error}</div>}

      {report && metrics && <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: "Order value", value: ghs(metrics.grossOrderValue), note: `${metrics.orderCount} orders`, color: "#bfdbfe" },
            { label: "Delivered revenue", value: ghs(metrics.completedRevenue), note: `${metrics.completedCount} completed`, color: "#6ee7b7" },
            { label: "Provider cost", value: ghs(metrics.providerCost), note: "Completed orders", color: "#c4b5fd" },
            { label: "Gross margin", value: ghs(metrics.expectedProfit), note: `Recorded admin ${ghs(metrics.recordedAdminProfit)}`, color: "#fcd34d" },
            { label: "Money at risk", value: ghs(report.snapshot.risk_amount), note: `${report.snapshot.issue_count} warnings`, color: report.snapshot.risk_amount > 0 ? "#fca5a5" : "#6ee7b7" },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{card.label}</p>
              <p className="mt-2 text-xl font-black" style={{ color: card.color }}>{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.note}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-2xl border p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-black text-white">Payment evidence</h2><p className="mt-1 text-xs text-slate-500">Evidence coverage for every order created on this date</p></div>
              <span className="text-lg font-black text-blue-300">{evidencePct.toFixed(1)}%</span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${evidencePct}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-3"><p className="text-lg font-black text-white">{metrics.paystackConfirmedCount}</p><p className="text-[10px] text-slate-500">Paystack</p><p className="mt-1 text-xs text-blue-300">{ghs(metrics.paystackConfirmedValue)}</p></div>
              <div className="rounded-xl border p-3"><p className="text-lg font-black text-white">{metrics.internalPaymentCount}</p><p className="text-[10px] text-slate-500">Wallet/manual/API</p><p className="mt-1 text-xs text-cyan-300">{ghs(metrics.internalPaymentValue)}</p></div>
              <div className="rounded-xl border p-3"><p className="text-lg font-black text-white">{metrics.unverifiedPaymentCount}</p><p className="text-[10px] text-slate-500">Unverified</p><p className="mt-1 text-xs text-red-300">{ghs(metrics.unverifiedPaymentValue)}</p></div>
            </div>
          </section>

          <section className="rounded-2xl border p-4 sm:p-5">
            <h2 className="font-black text-white">Money movement</h2>
            <div className="mt-4 space-y-3">
              {[
                ["Agent commissions", ghs(metrics.agentCommissions), "#c4b5fd"],
                ["Refunds recorded", ghs(metrics.refundedAmount), "#6ee7b7"],
                ["Possible refunds owed", ghs(metrics.refundExposureAmount), "#fca5a5"],
                ["Withdrawals processed", ghs(metrics.withdrawalAmount), "#fcd34d"],
                ["Awaiting approval", ghs(metrics.pendingApprovalAmount), "#93c5fd"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-slate-400">{label}</span><span className="font-black" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border">
          <div className="border-b border-slate-800 p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h2 className="font-black text-white">Reconciliation warnings</h2><p className="mt-1 text-xs text-slate-500">Investigate critical items before retrying delivery or paying commission.</p></div>
              <select value={filter} onChange={(event) => setFilter(event.target.value as ReconciliationIssueType | "all")}
                className="rounded-xl border px-3 py-2.5 text-sm text-white">
                <option value="all">All warnings ({report.issues.length})</option>
                {Object.entries(report.snapshot.issue_counts).filter(([, count]) => Number(count) > 0).map(([type, count]) => (
                  <option key={type} value={type}>{issueLabels[type as ReconciliationIssueType]} ({count})</option>
                ))}
              </select>
            </div>
          </div>
          {displayedIssues.length === 0 ? (
            <div className="p-10 text-center"><p className="text-2xl text-emerald-300">OK</p><p className="mt-2 font-bold text-emerald-300">No warnings in this category</p></div>
          ) : (
            <>
              <div className="divide-y divide-slate-800 sm:hidden">
                {displayedIssues.map((issue) => (
                  <article key={issue.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${issue.severity === "critical" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>{issue.severity}</span>
                        <h3 className="mt-3 font-bold text-white">{issue.title}</h3>
                      </div>
                      <span className="shrink-0 text-sm font-black text-white">{issue.amount > 0 ? ghs(issue.amount) : "-"}</span>
                    </div>
                    <p className="break-all font-mono text-xs text-blue-300">{issue.reference}</p>
                    <p className="text-xs leading-5 text-slate-500">{issue.detail}</p>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead><tr><th className="px-4 py-3">Severity</th><th>Issue</th><th>Reference</th><th>Details</th><th className="pr-4 text-right">Exposure</th></tr></thead>
                  <tbody>{displayedIssues.map((issue) => (
                    <tr key={issue.id} className="border-t border-slate-800">
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${issue.severity === "critical" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>{issue.severity}</span></td>
                      <td className="font-bold text-white">{issue.title}</td>
                      <td className="font-mono text-xs text-blue-300">{issue.reference}</td>
                      <td className="max-w-sm py-3 text-xs text-slate-500">{issue.detail}</td>
                      <td className="pr-4 text-right font-black text-white">{issue.amount > 0 ? ghs(issue.amount) : "-"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border p-4 sm:p-5">
          <h2 className="font-black text-white">Daily history</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {report.history.map((row) => {
              const appearance = statusStyle(row.status);
              return <button key={row.id} onClick={() => setDate(row.report_date)}
                className="min-w-36 rounded-xl border p-3 text-left" style={{ borderColor: row.report_date === date ? appearance.border : undefined }}>
                <p className="text-xs font-bold text-white">{new Date(`${row.report_date}T00:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</p>
                <p className="mt-2 text-sm font-black" style={{ color: appearance.color }}>{ghs(row.risk_amount)}</p>
                <p className="mt-1 text-[10px] text-slate-500">{row.issue_count} warnings</p>
              </button>;
            })}
          </div>
        </section>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-5 text-slate-400">
          <strong className="text-blue-300">Read-only safety:</strong> {report.methodology.note} Payment evidence means {report.methodology.paymentEvidence.toLowerCase()}. Gross margin is {report.methodology.expectedProfit.toLowerCase()}.
        </div>
      </>}
    </div>
  );
}
