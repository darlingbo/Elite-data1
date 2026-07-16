"use client";
import { useState, useRef } from "react";
import type { Order, OrderStatus } from "./shared/types";
import { PAGE_SIZE, BG, CARD, BORDER, BORDER2 } from "./shared/constants";
import { getNetBadge } from "./shared/utils";
import { Ic } from "./shared/Icons";

export function OrdersView({ orders, onRefresh, defaultFilter = "ALL" }: { orders: Order[]; onRefresh: () => void; defaultFilter?: OrderStatus }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus>(defaultFilter);
  const [agentFilter, setAgentFilter] = useState("");
  const [networkFilter, setNetworkFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ ref: string; ok: boolean; text: string } | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [deletingOne, setDeletingOne] = useState<string | null>(null);
  const [deletingFailed, setDeletingFailed] = useState(false);
  const [deleteFailedMsg, setDeleteFailedMsg] = useState("");
  const [sendingManual, setSendingManual] = useState<Record<string, boolean>>({});
  const [manualMsg, setManualMsg] = useState<{ ref: string; ok: boolean; text: string } | null>(null);
  const [sendingAllManual, setSendingAllManual] = useState(false);
  const [sendAllManualMsg, setSendAllManualMsg] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const aiEndRef = useRef<HTMLDivElement>(null);
  const [logsRef, setLogsRef] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; action: string; note: string; details: Record<string, unknown>; created_at: string }[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [approveMsg, setApproveMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [smsModal, setSmsModal] = useState<{ phone: string; name: string; message: string } | null>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<{ ok: boolean; text: string } | null>(null);

  const q = search.toLowerCase().trim();
  const aq = agentFilter.toLowerCase().trim();
  const filtered = orders.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).filter(o => {
    if (statusFilter !== "ALL" && o.status.toUpperCase() !== statusFilter && !(statusFilter === "PENDING_APPROVAL" && o.status === "pending_approval")) return false;
    if (networkFilter !== "ALL" && (o.network ?? "").toLowerCase() !== networkFilter.toLowerCase()) return false;
    if (aq && !(o.agent_name ?? "").toLowerCase().includes(aq) && !(o.agent_code ?? "").toLowerCase().includes(aq)) return false;
    if (!q) return true;
    return (o.customer_name ?? "").toLowerCase().includes(q) || (o.phone ?? "").includes(q) || (o.reference ?? "").toLowerCase().includes(q) || (o.network ?? "").toLowerCase().includes(q) || (o.agent_name ?? "").toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts: Record<OrderStatus, number> = {
    ALL: orders.length,
    COMPLETED: orders.filter(o => o.status.toUpperCase() === "COMPLETED").length,
    PROCESSING: orders.filter(o => o.status.toUpperCase() === "PROCESSING").length,
    PENDING: orders.filter(o => o.status.toUpperCase() === "PENDING").length,
    FAILED: orders.filter(o => o.status.toUpperCase() === "FAILED").length,
    NOT_ON_LIST: orders.filter(o => o.status.toUpperCase() === "NOT_ON_LIST").length,
    PENDING_APPROVAL: orders.filter(o => o.status === "pending_approval").length,
  };

  const tabDefs: { key: OrderStatus; color: string }[] = [
    { key: "ALL", color: "#3b82f6" }, { key: "COMPLETED", color: "#10b981" }, { key: "PROCESSING", color: "#3b82f6" },
    { key: "PENDING_APPROVAL", color: "#f59e0b" }, { key: "PENDING", color: "#94a3b8" }, { key: "FAILED", color: "#f87171" },
    { key: "NOT_ON_LIST", color: "#f97316" },
  ];

  const statusStyle: Record<string, { bg: string; color: string }> = {
    COMPLETED:        { bg: "rgba(16,185,129,0.1)",   color: "#10b981" },
    PROCESSING:       { bg: "rgba(59,130,246,0.1)",   color: "#3b82f6" },
    PENDING:          { bg: "rgba(148,163,184,0.1)",  color: "#94a3b8" },
    PENDING_APPROVAL: { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
    FAILED:           { bg: "rgba(248,113,113,0.1)",  color: "#f87171" },
    NOT_ON_LIST:      { bg: "rgba(249,115,22,0.15)",  color: "#f97316" },
    REJECTED:         { bg: "rgba(239,68,68,0.08)",   color: "#ef4444" },
  };

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
        msgs[r.reference] = { ok: r.ok, text: r.ok ? (action === "approve" ? "✓ Sent!" : "✓ Rejected") : `✗ ${r.message}` };
      }
      setApproveMsg(prev => ({ ...prev, ...msgs }));
      onRefresh();
      setTimeout(() => setApproveMsg(prev => { const n = { ...prev }; for (const ref of refSet) delete n[ref]; return n; }), 6000);
    } catch {
      const msgs: Record<string, { ok: boolean; text: string }> = {};
      for (const ref of references) msgs[ref] = { ok: false, text: "Network error" };
      setApproveMsg(prev => ({ ...prev, ...msgs }));
    } finally {
      setApproving(prev => { const n = new Set(prev); for (const ref of references) n.delete(ref); return n; });
    }
  }

  async function handleSendSMS() {
    if (!smsModal) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const res = await fetch("/api/admin/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsModal.phone, message: smsModal.message }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) {
        setSmsResult({ ok: true, text: "SMS sent!" });
        setTimeout(() => { setSmsModal(null); setSmsResult(null); }, 1800);
      } else {
        setSmsResult({ ok: false, text: d.error ?? "Failed to send" });
      }
    } catch {
      setSmsResult({ ok: false, text: "Network error" });
    } finally {
      setSmsSending(false);
    }
  }

  async function handleRetry(reference: string) {
    setRetrying(reference); setRetryMsg(null);
    try {
      const res = await fetch("/api/admin/orders/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { setRetryMsg({ ref: reference, ok: true, text: `✓ ${d.status === "completed" ? "Delivered!" : "Processing…"}` }); onRefresh(); }
      else setRetryMsg({ ref: reference, ok: false, text: "Retry failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setRetrying(null); setTimeout(() => setRetryMsg(null), 6000); }
  }

  async function handleDeleteOne(reference: string) {
    setDeletingOne(reference);
    try {
      const res = await fetch("/api/admin/orders/patch", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) onRefresh();
      else setRetryMsg({ ref: reference, ok: false, text: d.error ?? "Delete failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setDeletingOne(null); }
  }

  async function handleForceComplete(reference: string) {
    setCompleting(reference);
    try {
      const res = await fetch("/api/admin/orders/force-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { setRetryMsg({ ref: reference, ok: true, text: "✓ Marked complete" }); onRefresh(); }
      else setRetryMsg({ ref: reference, ok: false, text: d.error ?? "Failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setCompleting(null); setTimeout(() => setRetryMsg(null), 4000); }
  }

  function handleExport() {
    const rows = [
      ["Reference", "Status", "Customer", "Phone", "MoMo Refund Number", "Network", "Bundle", "Amount (GH₵)", "Agent", "Refunded", "Date"],
      ...filtered.map(o => [
        o.reference,
        o.status,
        o.customer_name ?? "",
        o.phone ?? "",
        o.refund_phone ?? "",
        (o.network ?? "").toUpperCase(),
        o.bundle_size ?? "",
        Number(o.amount).toFixed(2),
        o.agent_name ?? "Direct",
        o.refunded ? "Yes" : "No",
        new Date(o.created_at).toLocaleString("en-GH"),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const label = statusFilter === "ALL" ? "all" : statusFilter.toLowerCase();
    a.href = url; a.download = `orders-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function handleRefund(reference: string, amount: number) {
    if (!confirm(`Refund GH₵${amount.toFixed(2)} to customer via Paystack?`)) return;
    setRefunding(reference);
    try {
      const res = await fetch("/api/admin/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const d = await res.json();
      if (d.success) { setRetryMsg({ ref: reference, ok: true, text: `✓ Refunded GH₵${Number(d.amount).toFixed(2)}` }); onRefresh(); }
      else setRetryMsg({ ref: reference, ok: false, text: d.error ?? "Refund failed" });
    } catch { setRetryMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setRefunding(null); setTimeout(() => setRetryMsg(null), 5000); }
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const res = await fetch("/api/admin/sync-orders", { method: "POST" });
      const d = await res.json();
      setSyncMsg(d.updated > 0 ? `✓ ${d.updated} updated` : `✓ All up to date`);
      if (d.updated > 0) onRefresh();
    } catch { setSyncMsg("Sync failed"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 4000); }
  }

  async function handleDeleteFailed() {
    if (!window.confirm(`Delete ALL failed orders from the database? This cannot be undone.`)) return;
    setDeletingFailed(true); setDeleteFailedMsg("");
    try {
      const res = await fetch("/api/admin/orders/patch", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "failed" }) });
      const d = await res.json();
      if (d.success) { setDeleteFailedMsg(`✓ Deleted ${d.deleted ?? "all"} failed orders`); onRefresh(); }
      else setDeleteFailedMsg(d.error ?? "Delete failed");
    } catch { setDeleteFailedMsg("Network error"); }
    finally { setDeletingFailed(false); setTimeout(() => setDeleteFailedMsg(""), 5000); }
  }

  async function handleManualDelivery(reference: string) {
    setSendingManual(s => ({ ...s, [reference]: true }));
    setManualMsg(null);
    try {
      const res = await fetch("/api/admin/orders/manual-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ references: [reference] }) });
      const d = await res.json();
      if (d.queued > 0) { setManualMsg({ ref: reference, ok: true, text: "✓ Admin alerted" }); onRefresh(); }
      else setManualMsg({ ref: reference, ok: false, text: d.error ?? "Failed" });
    } catch { setManualMsg({ ref: reference, ok: false, text: "Network error" }); }
    finally { setSendingManual(s => ({ ...s, [reference]: false })); setTimeout(() => setManualMsg(null), 5000); }
  }

  async function handleSendAllManual() {
    const failedRefs = filtered.filter(o => o.status.toUpperCase() === "FAILED").map(o => o.reference).filter(Boolean);
    if (failedRefs.length === 0) { setSendAllManualMsg("No failed orders in current view"); setTimeout(() => setSendAllManualMsg(""), 3000); return; }
    if (!window.confirm(`Send ${failedRefs.length} failed order(s) for manual delivery? Admin will be notified via Telegram & WhatsApp.`)) return;
    setSendingAllManual(true); setSendAllManualMsg("");
    try {
      const res = await fetch("/api/admin/orders/manual-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ references: failedRefs }) });
      const d = await res.json();
      if (d.queued > 0) { setSendAllManualMsg(`✓ ${d.queued} order(s) queued for manual delivery`); onRefresh(); }
      else setSendAllManualMsg(d.error ?? "Failed");
    } catch { setSendAllManualMsg("Network error"); }
    finally { setSendingAllManual(false); setTimeout(() => setSendAllManualMsg(""), 6000); }
  }

  async function handleRecalculate() {
    setRecalculating(true); setRecalcMsg("");
    try {
      const res = await fetch("/api/admin/recalculate-commissions", { method: "POST" });
      const d = await res.json();
      setRecalcMsg(d.updated > 0 ? `✓ ${d.updated} agents credited` : "✓ All commissions up to date");
      onRefresh();
    } catch { setRecalcMsg("Failed"); }
    finally { setRecalculating(false); setTimeout(() => setRecalcMsg(""), 5000); }
  }

  async function handleAiSend() {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim();
    setAiInput("");
    setAiMessages(m => [...m, { role: "user", text: msg }]);
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/ai-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
      const d = await res.json();
      setAiMessages(m => [...m, { role: "ai", text: d.reply ?? "No response." }]);
      if (d.action && d.action !== "lookup" && d.action !== "unknown") onRefresh();
    } catch {
      setAiMessages(m => [...m, { role: "ai", text: "Network error. Please try again." }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function openLogs(reference: string) {
    setLogsRef(reference);
    setLogsLoading(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/admin/order-logs?reference=${encodeURIComponent(reference)}`);
      const d = await res.json();
      setLogs(d.logs ?? []);
    } catch { setLogs([]); }
    finally { setLogsLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">All Orders</h1>
          <p className="text-sm text-slate-500">{orders.length.toLocaleString()} total · {filtered.length.toLocaleString()} shown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><Ic.search /></span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search…"
              className="pl-9 pr-4 py-2 text-sm rounded-xl border focus:outline-none focus:border-blue-500 w-44 text-white placeholder-slate-600" style={{ background: CARD, borderColor: BORDER }} />
          </div>
          <input value={agentFilter} onChange={e => { setAgentFilter(e.target.value); setPage(1); }} placeholder="Filter by agent…"
            className="px-3 py-2 text-sm rounded-xl border focus:outline-none w-36 text-white placeholder-slate-600"
            style={{ background: agentFilter ? "rgba(139,92,246,0.12)" : CARD, borderColor: agentFilter ? "rgba(139,92,246,0.5)" : BORDER }} />
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
          <button onClick={handleSync} disabled={syncing} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl transition-colors" style={{ background: "rgba(59,130,246,0.1)", borderColor: "#3b82f660", color: "#60a5fa" }}>{syncing ? "Syncing…" : "⚡ Sync"}</button>
          <button onClick={handleRecalculate} disabled={recalculating} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", borderColor: "#22c55e60", color: "#4ade80" }}>{recalculating ? "Fixing…" : "💰 Fix Commissions"}</button>
          <button onClick={handleExport} className="text-sm font-medium border px-3 py-2 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", borderColor: "#22c55e60", color: "#4ade80" }} title={`Export ${filtered.length} orders as CSV`}>⬇️ Export {statusFilter === "ALL" ? "" : statusFilter} ({filtered.length})</button>
          <button onClick={handleSendAllManual} disabled={sendingAllManual} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl" style={{ background: "rgba(168,85,247,0.1)", borderColor: "#a855f760", color: "#c084fc" }}>{sendingAllManual ? "Sending…" : "📬 Manual Delivery"}</button>
          <button onClick={handleDeleteFailed} disabled={deletingFailed} className="text-sm font-medium disabled:opacity-60 border px-3 py-2 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#ef444460", color: "#f87171" }}>{deletingFailed ? "Deleting…" : "🗑️ Delete Failed"}</button>
          <button onClick={() => setAiOpen(v => !v)} className="text-sm font-bold border px-3 py-2 rounded-xl transition-all" style={{ background: aiOpen ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.5)", color: "#a78bfa" }}>🤖 Ask AI</button>
          {syncMsg && <span className="text-xs font-semibold text-green-400">{syncMsg}</span>}
          {recalcMsg && <span className="text-xs font-semibold text-green-400">{recalcMsg}</span>}
          {deleteFailedMsg && <span className="text-xs font-semibold" style={{ color: deleteFailedMsg.startsWith("✓") ? "#4ade80" : "#f87171" }}>{deleteFailedMsg}</span>}
          {sendAllManualMsg && <span className="text-xs font-semibold" style={{ color: sendAllManualMsg.startsWith("✓") ? "#4ade80" : "#f87171" }}>{sendAllManualMsg}</span>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {tabDefs.map(({ key, color }) => {
          const active = statusFilter === key;
          const label = key === "ALL" ? "All" : key === "NOT_ON_LIST" ? "⚠️ Not On List" : key === "PENDING_APPROVAL" ? "⏳ Awaiting Approval" : key.charAt(0) + key.slice(1).toLowerCase();
          return (
            <button key={key} onClick={() => { setStatusFilter(key); setPage(1); setSelectedRefs(new Set()); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-all"
              style={active ? { background: `${color}20`, color, borderColor: `${color}50` } : { background: CARD, color: "#64748b", borderColor: BORDER }}>
              {label}
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-black" style={{ background: active ? `${color}30` : BORDER2, color: active ? color : "#475569" }}>{counts[key]}</span>
            </button>
          );
        })}
      </div>

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
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {selectedRefs.size > 0 && (
              <>
                <button
                  onClick={() => handleApproveOrReject([...selectedRefs], "approve")}
                  disabled={approving.size > 0}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50 transition-all"
                  style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.4)" }}>
                  {approving.size > 0 ? "Sending…" : `✅ Approve ${selectedRefs.size > 1 ? `${selectedRefs.size} Orders` : "Order"}`}
                </button>
                <button
                  onClick={() => { if (window.confirm(`Reject ${selectedRefs.size} order(s)? Customers will be notified.`)) handleApproveOrReject([...selectedRefs], "reject"); }}
                  disabled={approving.size > 0}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50 transition-all"
                  style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)" }}>
                  ❌ Reject {selectedRefs.size > 1 ? `${selectedRefs.size}` : ""}
                </button>
              </>
            )}
            <span className="text-xs text-amber-400/60 font-medium">{counts.PENDING_APPROVAL} order{counts.PENDING_APPROVAL !== 1 ? "s" : ""} waiting</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-slate-500 uppercase tracking-wider" style={{ background: BG, borderColor: BORDER }}>
                {(statusFilter === "PENDING_APPROVAL" ? ["", "#"] : ["#"]).concat(["Customer", "Network", "Phone", "MoMo Refund", "Amount", "Profit", "Source", "Status", "Date", ""]).map((h, i) => (
                  <th key={`${h}-${i}`} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((o, idx) => {
                const nb = getNetBadge(o.network);
                const isPendingApproval = o.status === "pending_approval";
                const st = statusStyle[isPendingApproval ? "PENDING_APPROVAL" : o.status.toUpperCase()] ?? { bg: "transparent", color: "#94a3b8" };
                const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
                const isSelected = selectedRefs.has(o.reference);
                const isApprovingThis = approving.has(o.reference);
                const approveMsgThis = approveMsg[o.reference];
                return (
                  <tr key={o.reference ?? idx} className="border-b hover:bg-white/2 transition-colors last:border-0" style={{ borderColor: BORDER, background: isSelected ? "rgba(245,158,11,0.04)" : undefined }}>
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
                      <a href={`/track?ref=${encodeURIComponent(o.reference ?? "")}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 font-mono mt-0.5 underline underline-offset-2">{o.reference ? o.reference.slice(0, 14) + "…" : "—"}</a>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded" style={{ background: nb.bg, color: nb.color }}>{nb.label}</span>
                        <span className="text-slate-400 text-xs">{cleanSize}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{o.phone}</td>
                    <td className="px-4 py-3.5">
                      {o.refund_phone
                        ? <span className="font-mono text-xs font-bold" style={{ color: "#fbbf24" }}>{o.refund_phone}</span>
                        : <span className="text-xs text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3.5 font-black text-white">GH₵{Number(o.amount).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black" style={{ color: "#4ade80" }}>GH₵{Number(o.admin_commission).toFixed(2)}</td>
                    <td className="px-4 py-3.5">
                      {o.agent_name
                        ? <button onClick={() => { setAgentFilter(o.agent_name!); setPage(1); }} className="text-xs font-semibold px-2 py-0.5 rounded-full truncate max-w-25" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }} title={o.agent_name}>{o.agent_name}</button>
                        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: BORDER2, color: "#64748b" }}>Direct</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                        {isPendingApproval ? "⏳ Awaiting Approval" : (o.status ?? "").toLowerCase() === "not_on_list" ? "⚠️ Not On List" : (o.status ?? "").charAt(0) + (o.status ?? "").slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {isPendingApproval && o.reference && (
                          approveMsgThis ? (
                            <span className={`text-xs font-bold ${approveMsgThis.ok ? "text-green-400" : "text-red-400"}`}>{approveMsgThis.text}</span>
                          ) : (
                            <>
                              <button
                                onClick={() => { if (window.confirm(`Approve this order and send data to ${o.phone}?`)) handleApproveOrReject([o.reference], "approve"); }}
                                disabled={isApprovingThis}
                                title="Approve & send"
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap"
                                style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid rgba(16,185,129,0.4)" }}>
                                {isApprovingThis ? "…" : "Approve"}
                              </button>
                              <button
                                onClick={() => { if (window.confirm("Reject this order? The customer will be notified.")) handleApproveOrReject([o.reference], "reject"); }}
                                disabled={isApprovingThis}
                                title="Reject order"
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
                                Reject
                              </button>
                            </>
                          )
                        )}
                        {["pending", "processing", "failed", "not_on_list"].includes((o.status ?? "").toLowerCase()) && o.reference && (
                          (manualMsg?.ref === o.reference) ? (
                            <span className={`text-xs font-bold ${manualMsg.ok ? "text-green-400" : "text-red-400"}`}>{manualMsg.text}</span>
                          ) : retryMsg?.ref === o.reference ? (
                            <span className={`text-xs font-bold ${retryMsg.ok ? "text-green-400" : "text-red-400"}`}>{retryMsg.text}</span>
                          ) : (
                            <>
                              <button onClick={() => handleRetry(o.reference)} disabled={retrying === o.reference || completing === o.reference || deletingOne === o.reference}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.3)" }}>
                                {retrying === o.reference ? "…" : "🔄"}
                              </button>
                              {(o.status ?? "").toLowerCase() === "failed" && (
                                <button onClick={() => handleManualDelivery(o.reference)} disabled={sendingManual[o.reference] || retrying === o.reference || completing === o.reference}
                                  title="Queue for manual delivery — alerts admin via Telegram & WhatsApp"
                                  className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" }}>
                                  {sendingManual[o.reference] ? "…" : "📬"}
                                </button>
                              )}
                              <button onClick={() => handleForceComplete(o.reference)} disabled={completing === o.reference || retrying === o.reference || deletingOne === o.reference}
                                title="Force complete" className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}>
                                {completing === o.reference ? "…" : "✓"}
                              </button>
                              <button
                                onClick={() => { if (window.confirm("Delete this failed order? This cannot be undone.")) handleDeleteOne(o.reference); }}
                                disabled={deletingOne === o.reference || retrying === o.reference || completing === o.reference}
                                title="Delete order"
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                                {deletingOne === o.reference ? "…" : "🗑"}
                              </button>
                            </>
                          )
                        )}
                        {["failed", "completed"].includes((o.status ?? "").toLowerCase()) && !o.refunded && o.amount > 0 && (
                          <button onClick={() => handleRefund(o.reference, o.amount)} disabled={refunding === o.reference}
                            title="Refund customer via Paystack"
                            className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                            style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                            {refunding === o.reference ? "…" : "↩️"}
                          </button>
                        )}
                        {o.refunded && (
                          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>Refunded</span>
                        )}
                        <button onClick={() => openLogs(o.reference)} title="View logs"
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}>
                          📋
                        </button>
                        <button
                          onClick={() => {
                            const firstName = (o.customer_name ?? "Customer").split(" ")[0];
                            const shortRef = o.reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
                            setSmsModal({ phone: o.phone ?? "", name: firstName, message: `Hi ${firstName}! Your order (Ref: ${shortRef}) has been processed. Thank you for choosing Elite Data!` });
                            setSmsResult(null);
                          }}
                          title="Send SMS to customer"
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                          style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>
                          💬
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageOrders.length === 0 && <div className="py-20 text-center"><p className="text-4xl mb-3">📭</p><p className="font-semibold text-slate-500">No orders match your filter</p></div>}
        </div>

        {aiOpen && (
          <div className="border-t" style={{ borderColor: BORDER, background: "#0a0f1e" }}>
            <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: BORDER }}>
              <span className="text-xs font-black text-purple-400">🤖 AI Order Assistant</span>
              <span className="text-xs text-slate-600">{'Type a command — e.g. "retry order TRX-1234" or "mark REF-5678 as completed"'}</span>
            </div>
            <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
              {aiMessages.length === 0 && <p className="text-xs text-slate-600 italic">No messages yet. Type a command below.</p>}
              {aiMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs font-medium whitespace-pre-wrap ${m.role === "user" ? "text-white" : "text-slate-200"}`}
                    style={{ background: m.role === "user" ? "linear-gradient(90deg,#3b82f6,#8b5cf6)" : "#162032" }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {aiLoading && <div className="flex justify-start"><div className="px-3 py-2 rounded-xl text-xs text-slate-500 animate-pulse" style={{ background: "#162032" }}>AI is thinking…</div></div>}
              <div ref={aiEndRef} />
            </div>
            <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: BORDER }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAiSend()}
                placeholder="e.g. 'retry order TRX-1234' or 'mark order REF-9876 as completed'…"
                className="flex-1 px-3 py-2 text-sm rounded-xl border focus:outline-none focus:border-purple-500 text-white placeholder-slate-600"
                style={{ background: CARD, borderColor: BORDER }} />
              <button onClick={handleAiSend} disabled={aiLoading || !aiInput.trim()}
                className="px-4 py-2 text-sm font-bold rounded-xl disabled:opacity-40 text-white"
                style={{ background: "linear-gradient(90deg,#7c3aed,#8b5cf6)" }}>
                {aiLoading ? "…" : "Send"}
              </button>
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between" style={{ background: BG, borderColor: BORDER }}>
            <p className="text-xs text-slate-500">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-slate-400 hover:text-white disabled:opacity-40" style={{ background: CARD, borderColor: BORDER }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return <button key={pg} onClick={() => setPage(pg)} className="w-8 h-8 text-xs font-semibold rounded-lg transition-colors" style={pg === page ? { background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", color: "#fff" } : { background: CARD, color: "#64748b", border: `1px solid ${BORDER}` }}>{pg}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-slate-400 hover:text-white disabled:opacity-40" style={{ background: CARD, borderColor: BORDER }}>Next →</button>
            </div>
          </div>
        )}
      </div>

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

      {logsRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setLogsRef(null)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg border max-h-[80vh] flex flex-col" style={{ background: "#0e1928", borderColor: BORDER2 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
              <div>
                <p className="font-black text-white">Order Logs</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{logsRef}</p>
              </div>
              <button onClick={() => setLogsRef(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {logsLoading && <p className="text-sm text-slate-500 text-center py-8">Loading…</p>}
              {!logsLoading && logs.length === 0 && <p className="text-sm text-slate-600 text-center py-8 italic">No logs yet for this order.</p>}
              {logs.map(log => (
                <div key={log.id} className="rounded-xl p-3 border" style={{ background: "#162032", borderColor: BORDER }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>{log.action}</span>
                    <span className="text-[11px] text-slate-600">{new Date(log.created_at).toLocaleString("en-GH")}</span>
                  </div>
                  {log.note && <p className="text-xs text-slate-300">{log.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
