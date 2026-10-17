"use client";
import { useEffect, useMemo, useState } from "react";
import type { Order, OrderStatus } from "./shared/types";
import { PAGE_SIZE } from "./shared/constants";
import Icon from "@/components/ed/Icon";
import HoldButton from "./ui/HoldButton";
import OrderSheet from "./OrderSheet";
import { NETWORK_META, parseNetwork } from "@/lib/ed-networks";
import { getOrderReviewSecondsRemaining } from "@/lib/order-review-window";
import { REJECT_REASONS, rejectionSms, type RejectReasonId } from "@/lib/admin-sms-templates";

const money = (n: number) => `GH₵${Number(n).toFixed(2)}`;
const spaced = (p: string) => (p ?? "").replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");

function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

const TABS: { key: OrderStatus; label: string }[] = [
  { key: "PENDING_APPROVAL", label: "Waiting" },
  { key: "ALL", label: "All orders" },
  { key: "PROCESSING", label: "Sending" },
  { key: "FAILED", label: "Failed" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PENDING", label: "Pending" },
  { key: "NOT_ON_LIST", label: "New number (72h)" },
  { key: "REJECTED", label: "Rejected" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "FRAUD", label: "Fraud" },
];

const STATUS_PILL: Record<string, { bg: string; color: string; text: string }> = {
  COMPLETED: { bg: "rgba(34,197,94,.14)", color: "#22c55e", text: "Delivered" },
  PROCESSING: { bg: "rgba(251,191,36,.14)", color: "#fbbf24", text: "Sending" },
  PENDING: { bg: "rgba(148,163,184,.16)", color: "#94a3b8", text: "Pending" },
  PENDING_APPROVAL: { bg: "rgba(245,158,11,.16)", color: "#f59e0b", text: "Waiting" },
  FAILED: { bg: "rgba(239,68,68,.16)", color: "#ef4444", text: "Failed" },
  NOT_ON_LIST: { bg: "rgba(249,115,22,.16)", color: "#f97316", text: "New number" },
  REJECTED: { bg: "rgba(239,68,68,.1)", color: "#f87171", text: "Rejected" },
  REFUNDED: { bg: "rgba(52,211,153,.14)", color: "#34d399", text: "Refunded" },
  FRAUD: { bg: "rgba(220,38,38,.16)", color: "#dc2626", text: "Fraud" },
};

export function OrdersView({
  orders,
  onRefresh,
  defaultFilter = "PENDING_APPROVAL",
  initialSearch = "",
}: {
  orders: Order[];
  onRefresh: () => void;
  defaultFilter?: OrderStatus;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<OrderStatus>(initialSearch ? "ALL" : defaultFilter);
  const [networkFilter, setNetworkFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [handledRefs, setHandledRefs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Order | null>(null);
  const [bulk, setBulk] = useState<"approve" | "reject" | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState<RejectReasonId>("network_down");
  const [textCustomers, setTextCustomers] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const q = search.toLowerCase().trim();
  const filtered = useMemo(() => orders
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((o) => {
      if (handledRefs.has(o.reference)) return false;
      if (statusFilter === "PENDING_APPROVAL" && o.status !== "pending_approval") return false;
      if (statusFilter !== "ALL" && statusFilter !== "PENDING_APPROVAL" && o.status.toUpperCase() !== statusFilter.toUpperCase()) return false;
      if (networkFilter !== "ALL" && (o.network ?? "").toLowerCase() !== networkFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        (o.reference ?? "").toLowerCase().includes(q) ||
        (o.network ?? "").toLowerCase().includes(q)
      );
    }), [orders, handledRefs, statusFilter, networkFilter, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewReady = (o: Order) => getOrderReviewSecondsRemaining(o.created_at, now) === 0;

  const counts = useMemo(() => {
    const c: Record<OrderStatus, number> = { PENDING_APPROVAL: 0, ALL: orders.length, COMPLETED: 0, PROCESSING: 0, FAILED: 0, PENDING: 0, NOT_ON_LIST: 0, FRAUD: 0, REJECTED: 0, REFUNDED: 0 };
    for (const o of orders) {
      if (o.status === "pending_approval") c.PENDING_APPROVAL++;
      else { const k = o.status.toUpperCase() as OrderStatus; if (k in c) c[k]++; }
    }
    return c;
  }, [orders]);

  function toggle(ref: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; });
  }

  const selectable = pageOrders.filter((o) => o.status === "pending_approval" && reviewReady(o));

  async function runBulk(action: "approve" | "reject") {
    const references = [...selected];
    setBulkBusy(true); setBulkMsg(null);
    try {
      const res = await fetch("/api/admin/orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reject" ? { references, action, reason, notifyCustomer: textCustomers, willRefund: textCustomers } : { references, action }),
      });
      const d = (await res.json()) as { results?: { reference: string; ok: boolean; message: string }[]; error?: string };
      const results = d.results ?? [];
      const okRefs = results.filter((r) => r.ok).map((r) => r.reference);
      const bad = results.filter((r) => !r.ok);
      if (okRefs.length) setHandledRefs((prev) => new Set([...prev, ...okRefs]));
      setBulkMsg({
        ok: bad.length === 0 && !d.error,
        text: d.error ?? (bad.length === 0 ? `${okRefs.length} order${okRefs.length === 1 ? "" : "s"} ${action === "approve" ? "approved" : "rejected"}.` : `${okRefs.length} done, ${bad.length} not done: ${bad[0].message}`),
      });
      setSelected(new Set());
      setBulk(null);
      onRefresh();
    } catch {
      setBulkMsg({ ok: false, text: "Network error. Nothing was changed." });
    } finally {
      setBulkBusy(false);
    }
  }

  function handleExport() {
    const rows = [
      ["Reference", "Status", "Customer", "Phone", "Network", "Bundle", "Amount (GH₵)", "Date"],
      ...filtered.map((o) => [o.reference, o.status, o.customer_name ?? "", o.phone ?? "", (o.network ?? "").toUpperCase(), o.bundle_size ?? "", Number(o.amount).toFixed(2), new Date(o.created_at).toLocaleString("en-GH")]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `orders-${statusFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-section ad-orders">
      <div className="ad-orders-head">
        <div>
          <h2 className="ed-h2" style={{ fontSize: 22 }}>Orders</h2>
          <p className="ed-muted" style={{ margin: 0, fontSize: 13 }}>{orders.length.toLocaleString()} in total, {filtered.length.toLocaleString()} shown</p>
        </div>
        <div className="ad-orders-tools">
          <label className="ad-search"><Icon name="search" small /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, number or reference" aria-label="Search orders" /></label>
          <select value={networkFilter} onChange={(e) => { setNetworkFilter(e.target.value); setPage(1); }} className="ad-select" aria-label="Network">
            <option value="ALL">All networks</option>
            <option value="mtn">MTN</option>
            <option value="telecel">Telecel</option>
            <option value="airteltigo">AirtelTigo</option>
            <option value="voucher">Voucher</option>
          </select>
          <button type="button" className="ed-btn o" style={{ minHeight: 44 }} onClick={onRefresh}><Icon name="retry" small />Refresh</button>
          <button type="button" className="ed-btn o" style={{ minHeight: 44 }} onClick={handleExport}>Export CSV</button>
        </div>
      </div>

      <div className="ed-chips ad-tabs" role="tablist" aria-label="Order status">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={statusFilter === key} className={`ed-chip${statusFilter === key ? " on" : ""}`} style={{ whiteSpace: "nowrap" }}
            onClick={() => { setStatusFilter(key); setPage(1); setSelected(new Set()); }}>
            {label} <b className="ed-num" style={{ marginLeft: 6 }}>{counts[key]}</b>
          </button>
        ))}
      </div>

      {bulkMsg && <p className={`ad-msg ${bulkMsg.ok ? "ok" : "bad"}`} role="status">{bulkMsg.text}</p>}

      {statusFilter === "PENDING_APPROVAL" && selectable.length > 0 && (
        <div className="ad-selectall">
          <label>
            <input type="checkbox" checked={selected.size > 0 && selected.size === selectable.length} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((o) => o.reference)) : new Set())} />
            {selected.size > 0 ? `${selected.size} selected` : "Select all ready orders on this page"}
          </label>
        </div>
      )}

      <div className="ad-orows">
        {pageOrders.map((o) => {
          const meta = NETWORK_META[parseNetwork(o.network)];
          const isWaiting = o.status === "pending_approval";
          const waitLeft = isWaiting ? getOrderReviewSecondsRemaining(o.created_at, now) : 0;
          const pill = STATUS_PILL[isWaiting ? "PENDING_APPROVAL" : o.status.toUpperCase()];
          const flag = o.risk_flags?.[0];
          return (
            <div key={o.reference} className={`ad-orow${selected.has(o.reference) ? " sel" : ""}`}>
              {statusFilter === "PENDING_APPROVAL" ? (
                <button type="button" className="ad-ck" role="checkbox" aria-checked={selected.has(o.reference)} aria-label={`Select ${o.reference}`} disabled={!isWaiting || waitLeft > 0} onClick={() => toggle(o.reference)}>
                  {selected.has(o.reference) && <Icon name="check" small />}
                </button>
              ) : null}
              <button type="button" className="ad-orow-main" onClick={() => setOpen(o)} aria-label={`Open order ${o.reference}`}>
                <span className="t">
                  <b><i style={{ background: meta.color }} />{(o.network ?? "").toUpperCase()} {(o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "")}</b>
                  <span className="ed-num">{spaced(o.phone)}, {ago(o.created_at, now)}</span>
                </span>
                <span className="p">
                  {money(o.amount)}
                  {isWaiting && waitLeft > 0 ? <small>Review {waitLeft}s</small> : flag ? <small>{flag}</small> : null}
                </span>
                {statusFilter !== "PENDING_APPROVAL" && pill && <span className="ad-pill" style={{ background: pill.bg, color: pill.color }}>{pill.text}</span>}
              </button>
            </div>
          );
        })}
        {pageOrders.length === 0 && <p className="ed-muted" style={{ textAlign: "center", padding: "48px 0" }}>No orders match.</p>}
      </div>

      {totalPages > 1 && (
        <div className="ad-pager">
          <span className="ed-muted ed-num" style={{ fontSize: 12 }}>{(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ed-btn o" style={{ minHeight: 44 }} disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <button type="button" className="ed-btn o" style={{ minHeight: 44 }} disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="ad-selbar">
          <button type="button" className="ed-btn r" onClick={() => setBulk("reject")}>Reject {selected.size}</button>
          <button type="button" className="ed-btn g" onClick={() => setBulk("approve")}>Approve {selected.size}</button>
        </div>
      )}

      {bulk && (
        <div className="ed-overlay" onClick={() => !bulkBusy && setBulk(null)}>
          <div className="ed-sheet dk" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="ed-grab" />
            <div className="ad-sheet-title">
              <b>{bulk === "approve" ? `Approve ${selected.size} order${selected.size === 1 ? "" : "s"}?` : `Reject ${selected.size} order${selected.size === 1 ? "" : "s"}?`}</b>
              <button type="button" className="ad-x" onClick={() => setBulk(null)} aria-label="Close"><Icon name="x" /></button>
            </div>
            {bulk === "approve" ? (
              <>
                <p className="ad-info">The data for these orders is sent to the network now. This is the same step Telegram uses.</p>
                <button type="button" className="ed-btn g tall block" disabled={bulkBusy} onClick={() => void runBulk("approve")}>{bulkBusy ? "Sending…" : `Approve ${selected.size}`}</button>
              </>
            ) : (
              <>
                <div className="ad-chips2" role="radiogroup" aria-label="Reason">
                  {REJECT_REASONS.map((r) => <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={`ad-ch2${reason === r.id ? " on" : ""}`} onClick={() => setReason(r.id)}>{r.label}</button>)}
                </div>
                <div className="ad-trow"><div className="t"><b>Text each customer</b>You send the refunds by hand afterwards</div>
                  <button type="button" role="switch" aria-checked={textCustomers} aria-label="Text each customer" className="ad-sw" onClick={() => setTextCustomers((v) => !v)} /></div>
                {textCustomers && <p className="ad-preview">{rejectionSms({ reference: "YBK-123456", reason, amount: 25, willRefund: true })}</p>}
                <HoldButton label={`Hold to reject ${selected.size}`} disabled={bulkBusy} onConfirm={() => void runBulk("reject")} />
              </>
            )}
            <button type="button" className="ed-btn o block" onClick={() => setBulk(null)} disabled={bulkBusy}>Cancel</button>
          </div>
        </div>
      )}

      {open && (
        <OrderSheet
          key={open.reference}
          order={open}
          onClose={() => setOpen(null)}
          onChanged={onRefresh}
          onHandled={(ref) => setHandledRefs((prev) => new Set([...prev, ref]))}
        />
      )}
    </div>
  );
}
