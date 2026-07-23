"use client";
import { useState, useEffect } from "react";

interface ManualOrder {
  id: string;
  agent_name: string;
  agent_code: string;
  customer_phone: string;
  network: string;
  bundle_size: string;
  amount_paid: number;
  cost_price: number;
  agent_commission: number;
  admin_profit: number;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
}

const D = {
  bg: "#0d1117",
  card: "#161b22",
  border: "#21262d",
  text: "#e6edf3",
  muted: "#8b949e",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function netColor(n: string) {
  if (n === "mtn") return { bg: "rgba(251,191,36,0.15)", text: "#fbbf24" };
  if (n === "telecel") return { bg: "rgba(239,68,68,0.15)", text: "#f87171" };
  return { bg: "rgba(59,130,246,0.15)", text: "#60a5fa" };
}

function statusBadge(status: string) {
  if (status === "approved") return { bg: "rgba(34,197,94,0.15)", text: "#4ade80", label: "Approved" };
  if (status === "rejected") return { bg: "rgba(239,68,68,0.15)", text: "#f87171", label: "Rejected" };
  return { bg: "rgba(251,191,36,0.15)", text: "#fbbf24", label: "Pending" };
}

export default function ManualOrdersAdmin() {
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [showReject, setShowReject] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/manual-orders");
      const d = await res.json();
      setOrders(d.orders ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOrders(); }, []);

  async function handleApprove(id: string) {
    setActing(a => ({ ...a, [id]: true }));
    setError(e => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/admin/manual-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approve" }),
      });
      const d = await res.json();
      if (d.success) {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "approved" } : o));
      } else {
        setError(e => ({ ...e, [id]: d.error ?? "Approval failed." }));
      }
    } catch {
      setError(e => ({ ...e, [id]: "Network error. Try again." }));
    } finally {
      setActing(a => ({ ...a, [id]: false }));
    }
  }

  async function handleReject(id: string) {
    setActing(a => ({ ...a, [id]: true }));
    setError(e => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/admin/manual-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject", note: rejectNote[id] ?? "" }),
      });
      const d = await res.json();
      if (d.success) {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "rejected", admin_note: rejectNote[id] ?? "" } : o));
        setShowReject(null);
      } else {
        setError(e => ({ ...e, [id]: d.error ?? "Rejection failed." }));
      }
    } catch {
      setError(e => ({ ...e, [id]: "Network error. Try again." }));
    } finally {
      setActing(a => ({ ...a, [id]: false }));
    }
  }

  const filtered = orders.filter(o => filter === "all" || o.status === filter);
  const pendingCount = orders.filter(o => o.status === "pending").length;

  return (
    <div className="admin-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: D.text, margin: 0 }}>Manual Order Requests</h2>
          <p style={{ fontSize: 13, color: D.muted, margin: "4px 0 0" }}>
            Agents submit payment proof → you approve to deliver data automatically
          </p>
        </div>
        <button onClick={fetchOrders} style={{ background: D.card, border: `1px solid ${D.border}`, color: D.muted, borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["pending", "all", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: filter === f ? (f === "pending" ? "#fbbf24" : f === "approved" ? "#22c55e" : f === "rejected" ? "#ef4444" : "#3b82f6") : D.card,
            color: filter === f ? (f === "pending" ? "#713f12" : "white") : D.muted,
            border: `1px solid ${filter === f ? "transparent" : D.border}`,
          }}>
            {f === "pending" ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: D.muted }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: D.card, borderRadius: 14, padding: "60px 20px", textAlign: "center", border: `1px solid ${D.border}` }}>
          <p style={{ color: D.muted, fontSize: 14, margin: 0 }}>
            {filter === "pending" ? "No pending requests. Agents will appear here when they submit manual orders." : `No ${filter} orders.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(o => {
            const nc = netColor(o.network);
            const sb = statusBadge(o.status);
            const isActing = acting[o.id];
            return (
              <div key={o.id} style={{ background: D.card, borderRadius: 14, padding: 20, border: `1px solid ${D.border}` }}>
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: D.text }}>{o.agent_name}</span>
                      <span style={{ fontSize: 11, color: D.muted, fontFamily: "monospace", background: "#21262d", padding: "2px 8px", borderRadius: 6 }}>{o.agent_code}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: sb.bg, color: sb.text }}>{sb.label}</span>
                    </div>
                    <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>{fmtDate(o.created_at)}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: nc.bg, color: nc.text, flexShrink: 0 }}>
                    {o.network.toUpperCase()}
                  </span>
                </div>

                {/* Order details grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Customer Phone", value: o.customer_phone },
                    { label: "Bundle", value: `${o.network.toUpperCase()} ${o.bundle_size}` },
                    { label: "Amount Collected", value: `GH₵${Number(o.amount_paid).toFixed(2)}` },
                    { label: "Cost Price", value: `GH₵${Number(o.cost_price).toFixed(2)}` },
                    { label: "Agent Commission", value: `GH₵${Number(o.agent_commission).toFixed(2)}`, green: true },
                    { label: "Your Profit", value: `GH₵${Number(o.admin_profit).toFixed(2)}`, green: true },
                  ].map(item => (
                    <div key={item.label} style={{ background: "#0d1117", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 10, color: D.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: item.green ? "#4ade80" : D.text, margin: 0 }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {o.admin_note && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                    <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>Note: {o.admin_note}</p>
                  </div>
                )}

                {error[o.id] && (
                  <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                    <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{error[o.id]}</p>
                  </div>
                )}

                {/* Actions */}
                {o.status === "pending" && (
                  showReject === o.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Reason for rejection (optional)"
                        value={rejectNote[o.id] ?? ""}
                        onChange={e => setRejectNote(n => ({ ...n, [o.id]: e.target.value }))}
                        style={{ width: "100%", background: "#0d1117", border: `1px solid ${D.border}`, borderRadius: 10, padding: "10px 14px", color: D.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleReject(o.id)} disabled={isActing}
                          style={{ flex: 1, background: "#ef4444", color: "white", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                          {isActing ? "Rejecting…" : "Confirm Reject"}
                        </button>
                        <button onClick={() => setShowReject(null)}
                          style={{ flex: 1, background: D.card, color: D.muted, border: `1px solid ${D.border}`, borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => handleApprove(o.id)} disabled={isActing}
                        style={{ flex: 1, background: "#22c55e", color: "white", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                        {isActing ? "Delivering…" : "✓ Approve & Deliver"}
                      </button>
                      <button onClick={() => setShowReject(o.id)} disabled={isActing}
                        style={{ flex: 1, background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                        ✕ Reject
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
