"use client";
import { useState } from "react";
import type { Order, OrderStatus } from "./shared/types";
import { PAGE_SIZE, BG, CARD, BORDER, BORDER2 } from "./shared/constants";
import { getNetBadge } from "./shared/utils";
import { Ic } from "./shared/Icons";

export function OrdersView({ orders, onRefresh, defaultFilter = "PENDING_APPROVAL" }: { orders: Order[]; onRefresh: () => void; defaultFilter?: OrderStatus }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>(defaultFilter);
  const [networkFilter, setNetworkFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  // Per-row action state
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [approveMsg, setApproveMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [deletingOne, setDeletingOne] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundMenu, setRefundMenu] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  // SMS modal
  const [smsModal, setSmsModal] = useState<{ phone: string; name: string; message: string } | null>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<{ ok: boolean; text: string } | null>(null);

  // ─── Filtering ───────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();
  const filtered = orders
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter(o => {
      if (statusFilter === "PENDING_APPROVAL" && o.status !== "pending_approval") return false;
      if (statusFilter !== "ALL" && statusFilter !== "PENDING_APPROVAL" && o.status.toUpperCase() !== statusFilter) return false;
      if (networkFilter !== "ALL" && (o.network ?? "").toLowerCase() !== networkFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.phone ?? "").includes(q) ||
        (o.reference ?? "").toLowerCase().includes(q) ||
        (o.network ?? "").toLowerCase().includes(q) ||
        (o.agent_name ?? "").toLowerCase().includes(q)
      );
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts: Record<OrderStatus, number> = {
    PENDING_APPROVAL: orders.filter(o => o.status === "pending_approval").length,
    ALL:              orders.length,
    COMPLETED:        orders.filter(o => o.status.toUpperCase() === "COMPLETED").length,
    PROCESSING:       orders.filter(o => o.status.toUpperCase() === "PROCESSING").length,
    FAILED:           orders.filter(o => o.status.toUpperCase() === "FAILED").length,
    PENDING:          orders.filter(o => o.status.toUpperCase() === "PENDING").length,
    NOT_ON_LIST:      orders.filter(o => o.status.toUpperCase() === "NOT_ON_LIST").length,
  };

  // Tab order: Awaiting → All → Completed → Processing → Failed → Pending
  const tabDefs: { key: OrderStatus; color: string; label: string }[] = [
    { key: "PENDING_APPROVAL", color: "#f59e0b", label: "Awaiting Approval" },
    { key: "ALL",              color: "#3b82f6", label: "All Orders" },
    { key: "COMPLETED",        color: "#10b981", label: "Completed" },
    { key: "PROCESSING",       color: "#3b82f6", label: "Processing" },
    { key: "FAILED",           color: "#f87171", label: "Failed" },
    { key: "PENDING",          color: "#94a3b8", label: "Pending" },
  ];

  const statusStyle: Record<string, { bg: string; color: string }> = {
    COMPLETED:        { bg: "rgba(16,185,129,0.1)",  color: "#10b981" },
    PROCESSING:       { bg: "rgba(59,130,246,0.1)",  color: "#3b82f6" },
    PENDING:          { bg: "rgba(148,163,184,0.1)", color: "#94a3b8" },
    PENDING_APPROVAL: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
    FAILED:           { bg: "rgba(248,113,113,0.1)", color: "#f87171" },
    NOT_ON_LIST:      { bg: "rgba(249,115,22,0.15)", color: "#f97316" },
    REJECTED:         { bg: "rgba(239,68,68,0.08)",  color: "#ef4444" },
  };

  function flashMsg(ref: string, ok: boolean, text: string, ms = 5000) {
    setActionMsg(prev => ({ ...prev, [ref]: { ok, text } }));
    setTimeout(() => setActionMsg(prev => { const n = { ...prev }; delete n[ref]; return n; }), ms);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function handleApproveOrReject(references: string[], action: "approve" | "reject") {
    const refSet = new Set(references);
    setApproving(prev => new Set([...prev, ...references]));
    setSelectedRefs(new Set());
    try {
      const res = await fetch("/api/admin/orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ references, action }),
      });
      const d = await res.json() as { results: { reference: string; ok: boolean; message: string }[] };
      const msgs: Record<string, { ok: boolean; text: string }> = {};
      for (const r of d.results ?? []) {
        msgs[r.reference] = { ok: r.ok, text: r.ok ? (action === "approve" ? "✓ Approved!" : "✓ Rejected") : `✗ ${r.message}` };
      }
      setApproveMsg(prev => ({ ...prev, ...msgs }));
      onRefresh();
      setTimeout(() => setApproveMsg(prev => { const n = { ...prev }; for (const ref of refSet) delete n[ref]; return n; }), 6000);
    } catch {
      for (const ref of references) flashMsg(ref, false, "Network error");
    } finally {
      setApproving(prev => { const n = new Set(prev); for (const ref of references) n.delete(ref); return n; });
    }
  }

  async function handleRetry(reference: string) {
    setRetrying(reference);
    try {
      const res = await fetch("/api/admin/orders/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { flashMsg(reference, true, "✓ Retried"); onRefresh(); }
      else flashMsg(reference, false, "Retry failed");
    } catch { flashMsg(reference, false, "Network error"); }
    finally { setRetrying(null); }
  }

  async function handleForceComplete(reference: string) {
    if (!window.confirm("Mark this order as Completed? Agent commission will be credited.")) return;
    setCompleting(reference);
    try {
      const res = await fetch("/api/admin/orders/force-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { flashMsg(reference, true, "✓ Marked complete"); onRefresh(); }
      else flashMsg(reference, false, d.error ?? "Failed");
    } catch { flashMsg(reference, false, "Network error"); }
    finally { setCompleting(null); }
  }

  async function handleDeleteOne(reference: string, status: string) {
    if (!window.confirm(`Delete this ${status} order permanently?`)) return;
    setDeletingOne(reference);
    try {
      const res = await fetch("/api/admin/orders/patch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const d = await res.json();
      if (d.success) { onRefresh(); }
      else flashMsg(reference, false, d.error ?? "Delete failed");
    } catch { flashMsg(reference, false, "Network error"); }
    finally { setDeletingOne(null); }
  }

  async function handlePaystackRefund(reference: string, amount: number) {
    if (!window.confirm(`Process a GH₵${amount.toFixed(2)} refund via Paystack? The money will go back to the customer automatically.`)) return;
    setRefunding(reference);
    try {
      const res = await fetch("/api/admin/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { flashMsg(reference, true, "✓ Refunded via Paystack"); onRefresh(); }
      else flashMsg(reference, false, d.error ?? "Refund failed");
    } catch { flashMsg(reference, false, "Network error"); }
    finally { setRefunding(null); setRefundMenu(null); }
  }

  async function handleMarkRefunded(reference: string) {
    if (!window.confirm("Mark as manually refunded? Use this only if you already sent the money back yourself (e.g. via MoMo). This just records it in the system.")) return;
    setRefunding(reference);
    try {
      const res = await fetch("/api/admin/orders/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, refunded: true }),
      });
      const d = await res.json();
      if (d.success) { flashMsg(reference, true, "✓ Marked as refunded"); onRefresh(); }
      else flashMsg(reference, false, d.error ?? "Failed");
    } catch { flashMsg(reference, false, "Network error"); }
    finally { setRefunding(null); setRefundMenu(null); }
  }

  async function handleSendSMS() {
    if (!smsModal) return;
    setSmsSending(true); setSmsResult(null);
    try {
      const res = await fetch("/api/admin/send-sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: smsModal.phone, message: smsModal.message }) });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) {
        setSmsResult({ ok: true, text: "SMS sent!" });
        setTimeout(() => { setSmsModal(null); setSmsResult(null); }, 1800);
      } else {
        setSmsResult({ ok: false, text: d.error ?? "Failed to send" });
      }
    } catch { setSmsResult({ ok: false, text: "Network error" }); }
    finally { setSmsSending(false); }
  }

  function handleExport() {
    const rows = [
      ["Reference", "Status", "Customer", "Phone", "Network", "Bundle", "Amount (GH₵)", "Agent", "Date"],
      ...filtered.map(o => [
        o.reference, o.status, o.customer_name ?? "", o.phone ?? "",
        (o.network ?? "").toUpperCase(), o.bundle_size ?? "",
        Number(o.amount).toFixed(2), o.agent_name ?? "Direct",
        new Date(o.created_at).toLocaleString("en-GH"),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders-${statusFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Orders</h1>
          <p className="text-sm text-slate-500">{orders.length.toLocaleString()} total · {filtered.length.toLocaleString()} shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Ic.search /></span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, phone, ref…"
              className="pl-9 pr-4 py-2 text-sm rounded-xl border focus:outline-none focus:border-blue-500 w-52 text-white placeholder-slate-600"
              style={{ background: CARD, borderColor: BORDER }} />
          </div>
          <select value={networkFilter} onChange={e => { setNetworkFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-xl border focus:outline-none text-white"
            style={{ background: networkFilter !== "ALL" ? "rgba(251,191,36,0.1)" : CARD, borderColor: networkFilter !== "ALL" ? "rgba(251,191,36,0.5)" : BORDER }}>
            <option value="ALL">All Networks</option>
            <option value="mtn">MTN</option>
            <option value="telecel">Telecel</option>
            <option value="airteltigo">AirtelTigo</option>
            <option value="voucher">Voucher</option>
          </select>
          <button onClick={onRefresh} className="text-sm font-medium text-slate-400 hover:text-white border px-3 py-2 rounded-xl transition-colors" style={{ background: CARD, borderColor: BORDER }}>↻ Refresh</button>
          <button onClick={handleExport} className="text-sm font-medium border px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", borderColor: "#22c55e60", color: "#4ade80" }}>⬇ CSV</button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabDefs.map(({ key, color, label }) => {
          const active = statusFilter === key;
          return (
            <button key={key} onClick={() => { setStatusFilter(key); setPage(1); setSelectedRefs(new Set()); setRefundMenu(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-all"
              style={active ? { background: `${color}20`, color, borderColor: `${color}50` } : { background: CARD, color: "#64748b", borderColor: BORDER }}>
              {label}
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-black" style={{ background: active ? `${color}30` : BORDER2, color: active ? color : "#475569" }}>{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {/* Bulk approve/reject bar — only on awaiting approval tab */}
      {statusFilter === "PENDING_APPROVAL" && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)" }}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox"
              checked={selectedRefs.size > 0 && selectedRefs.size === pageOrders.filter(o => o.status === "pending_approval").length}
              ref={el => { if (el) el.indeterminate = selectedRefs.size > 0 && selectedRefs.size < pageOrders.filter(o => o.status === "pending_approval").length; }}
              onChange={e => {
                const approvalOrders = pageOrders.filter(o => o.status === "pending_approval");
                setSelectedRefs(e.target.checked ? new Set(approvalOrders.map(o => o.reference)) : new Set());
              }}
              className="w-4 h-4 accent-amber-400 cursor-pointer" />
            <span className="text-sm font-semibold text-amber-400">
              {selectedRefs.size > 0 ? `${selectedRefs.size} selected` : "Select all on page"}
            </span>
          </label>
          {selectedRefs.size > 0 ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => handleApproveOrReject([...selectedRefs], "approve")} disabled={approving.size > 0}
                className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.4)" }}>
                {approving.size > 0 ? "Sending…" : `✅ Approve ${selectedRefs.size}`}
              </button>
              <button onClick={() => { if (window.confirm(`Reject ${selectedRefs.size} order(s)?`)) handleApproveOrReject([...selectedRefs], "reject"); }}
                disabled={approving.size > 0}
                className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)" }}>
                ❌ Reject {selectedRefs.size}
              </button>
            </div>
          ) : (
            <span className="text-xs text-amber-400/60 font-medium ml-auto">{counts.PENDING_APPROVAL} order{counts.PENDING_APPROVAL !== 1 ? "s" : ""} waiting</span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                {statusFilter === "PENDING_APPROVAL" && <th className="px-4 py-3 w-10" />}
                <th className="px-4 py-3 text-left font-semibold">#</th>
                <th className="px-4 py-3 text-left font-semibold">Customer</th>
                <th className="px-4 py-3 text-left font-semibold">Bundle</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-left font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Source</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((o, idx) => {
                const nb = getNetBadge(o.network);
                const isPendingApproval = o.status === "pending_approval";
                const statusKey = isPendingApproval ? "PENDING_APPROVAL" : o.status.toUpperCase();
                const st = statusStyle[statusKey] ?? { bg: "transparent", color: "#94a3b8" };
                const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
                const isSelected = selectedRefs.has(o.reference);
                const isApprovingThis = approving.has(o.reference);
                const approveMsgThis = approveMsg[o.reference];
                const msgThis = actionMsg[o.reference];
                const statusLower = (o.status ?? "").toLowerCase();
                const canComplete = ["processing", "pending", "failed", "not_on_list"].includes(statusLower);
                const canDelete   = ["failed", "pending", "processing"].includes(statusLower);
                const canRefund   = ["failed", "completed", "not_on_list", "rejected"].includes(statusLower) && !o.refunded && Number(o.amount) > 0;
                const refundBlocked = statusLower === "processing" && !o.refunded && Number(o.amount) > 0;

                return (
                  <tr key={o.reference ?? idx} className="border-b hover:bg-white/2 transition-colors last:border-0"
                    style={{ borderColor: BORDER, background: isSelected ? "rgba(245,158,11,0.04)" : undefined }}>

                    {statusFilter === "PENDING_APPROVAL" && (
                      <td className="pl-4 py-3.5 pr-1 w-10">
                        {isPendingApproval && (
                          <input type="checkbox" checked={isSelected}
                            onChange={e => setSelectedRefs(prev => { const n = new Set(prev); e.target.checked ? n.add(o.reference) : n.delete(o.reference); return n; })}
                            className="w-4 h-4 accent-amber-400 cursor-pointer" />
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3.5 text-slate-600 text-xs font-mono">{(page - 1) * PAGE_SIZE + idx + 1}</td>

                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-white whitespace-nowrap">{o.customer_name || o.phone || "—"}</p>
                      <a href={`/track?ref=${encodeURIComponent(o.reference ?? "")}`} target="_blank" rel="noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 font-mono mt-0.5 block">{o.reference ? o.reference.slice(0, 16) + "…" : "—"}</a>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>{nb.label}</span>
                        <span className="text-slate-300 text-xs font-semibold">{cleanSize}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{o.phone}</td>

                    <td className="px-4 py-3.5 font-black text-white">GH₵{Number(o.amount).toFixed(2)}</td>

                    <td className="px-4 py-3.5">
                      {o.agent_name
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full truncate max-w-24 block" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }} title={o.agent_name}>{o.agent_name}</span>
                        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: BORDER2, color: "#64748b" }}>Direct</span>}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                        {isPendingApproval ? "Awaiting Approval"
                          : statusLower === "not_on_list" ? "Not On List"
                          : statusLower === "rejected" ? "Rejected"
                          : (o.status ?? "").charAt(0).toUpperCase() + (o.status ?? "").slice(1).toLowerCase()}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      {(msgThis ?? approveMsgThis) ? (
                        <span className={`text-xs font-bold ${(msgThis ?? approveMsgThis)?.ok ? "text-green-400" : "text-red-400"}`}>
                          {(msgThis ?? approveMsgThis)?.text}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">

                          {/* Approve / Reject */}
                          {isPendingApproval && o.reference && (
                            <>
                              <button onClick={() => { if (window.confirm(`Approve and send data to ${o.phone}?`)) handleApproveOrReject([o.reference], "approve"); }}
                                disabled={isApprovingThis}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.4)" }}>
                                {isApprovingThis ? "…" : "✅ Approve"}
                              </button>
                              <button onClick={() => { if (window.confirm("Reject this order?")) handleApproveOrReject([o.reference], "reject"); }}
                                disabled={isApprovingThis}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
                                ❌ Reject
                              </button>
                            </>
                          )}

                          {/* Retry */}
                          {["pending", "processing", "failed", "not_on_list"].includes(statusLower) && o.reference && (
                            <button onClick={() => handleRetry(o.reference)} disabled={retrying === o.reference}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                              style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                              {retrying === o.reference ? "…" : "🔄 Retry"}
                            </button>
                          )}

                          {/* Mark as Completed */}
                          {canComplete && o.reference && (
                            <button onClick={() => handleForceComplete(o.reference)} disabled={completing === o.reference}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                              style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
                              {completing === o.reference ? "…" : "✓ Done"}
                            </button>
                          )}

                          {/* Refund — expand into two choices when clicked */}
                          {canRefund && o.reference && (
                            refundMenu === o.reference ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handlePaystackRefund(o.reference, Number(o.amount))} disabled={refunding === o.reference}
                                  className="text-xs font-bold px-2 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                                  style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                                  {refunding === o.reference ? "…" : "Via Paystack"}
                                </button>
                                <button onClick={() => handleMarkRefunded(o.reference)} disabled={refunding === o.reference}
                                  className="text-xs font-bold px-2 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                                  style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.25)" }}>
                                  {refunding === o.reference ? "…" : "Already Sent"}
                                </button>
                                <button onClick={() => setRefundMenu(null)} className="text-slate-600 hover:text-slate-400 text-xs px-1">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => setRefundMenu(o.reference)}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                                style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                                ↩ Refund
                              </button>
                            )
                          )}
                          {o.refunded && (
                            <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>Refunded</span>
                          )}
                          {refundBlocked && (
                            <span className="text-xs font-bold px-2 py-1 rounded-lg" title="Cannot refund while order is processing — wait for it to complete or fail" style={{ background: "rgba(59,130,246,0.08)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)", cursor: "help" }}>No refund yet</span>
                          )}

                          {/* Delete */}
                          {canDelete && o.reference && (
                            <button onClick={() => handleDeleteOne(o.reference, statusLower)} disabled={deletingOne === o.reference}
                              className="text-xs font-bold px-2 py-1.5 rounded-lg disabled:opacity-50"
                              style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                              {deletingOne === o.reference ? "…" : "🗑"}
                            </button>
                          )}

                          {/* SMS */}
                          <button
                            onClick={() => {
                              const firstName = (o.customer_name ?? "Customer").split(" ")[0];
                              const shortRef = o.reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
                              setSmsModal({ phone: o.phone ?? "", name: firstName, message: `Hi ${firstName}! Your ${(o.network ?? "").toUpperCase()} ${cleanSize} order (Ref: ${shortRef}) has been processed. Thank you for choosing Elite Data!` });
                              setSmsResult(null);
                            }}
                            title="Send SMS"
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                            style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>
                            💬
                          </button>

                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageOrders.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-semibold text-slate-500">No orders match your filter</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between" style={{ background: BG, borderColor: BORDER }}>
            <p className="text-xs text-slate-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-slate-400 hover:text-white disabled:opacity-40"
                style={{ background: CARD, borderColor: BORDER }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className="w-8 h-8 text-xs font-semibold rounded-lg transition-colors"
                    style={pg === page ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { background: CARD, color: "#64748b", border: `1px solid ${BORDER}` }}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-slate-400 hover:text-white disabled:opacity-40"
                style={{ background: CARD, borderColor: BORDER }}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* SMS Modal */}
      {smsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => { setSmsModal(null); setSmsResult(null); }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md border" style={{ background: "#0e1928", borderColor: BORDER2 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
              <div>
                <p className="font-black text-white">Send SMS</p>
                <p className="text-xs text-slate-500 mt-0.5">To: {smsModal.phone}</p>
              </div>
              <button onClick={() => { setSmsModal(null); setSmsResult(null); }} className="text-slate-500 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Phone</label>
                <input value={smsModal.phone} onChange={e => setSmsModal(m => m ? { ...m, phone: e.target.value } : m)}
                  className="w-full px-3 py-2 text-sm rounded-xl border text-white focus:outline-none"
                  style={{ background: "#162032", borderColor: BORDER }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Message</label>
                <textarea rows={4} value={smsModal.message} onChange={e => setSmsModal(m => m ? { ...m, message: e.target.value } : m)}
                  className="w-full px-3 py-2 text-sm rounded-xl border text-white focus:outline-none resize-none"
                  style={{ background: "#162032", borderColor: BORDER }} />
                <p className="text-right text-[11px] text-slate-600 mt-1">{smsModal.message.length}/500</p>
              </div>
              {smsResult && <p className={`text-sm font-bold text-center ${smsResult.ok ? "text-green-400" : "text-red-400"}`}>{smsResult.text}</p>}
              <button onClick={() => void handleSendSMS()} disabled={smsSending || !smsModal.phone || !smsModal.message}
                className="w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
                style={{ background: "linear-gradient(90deg,#16a34a,#22c55e)" }}>
                {smsSending ? "Sending…" : "Send SMS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
