"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const D = {
  bg: "#0d1117", card: "#161b22", border: "#21262d",
  text: "#e6edf3", muted: "#8b949e", blue: "#3b82f6",
};

interface OrderResult {
  reference: string;
  status: string;
  customer_name?: string;
  phone?: string;
  network?: string;
  bundle_size?: string;
  amount: number;
  created_at: string;
  inventor_status?: string | null;
  inventor_message?: string | null;
}

const STATUS: Record<string, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  pending:    { label: "Pending",    color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "⏳", desc: "Order received — waiting to be sent to provider." },
  processing: { label: "Processing", color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: "🔄", desc: "Provider is delivering your bundle. Usually 1–5 minutes." },
  completed:  { label: "Delivered",  color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "✅", desc: "Bundle delivered successfully to your phone!" },
  failed:     { label: "Failed",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "❌", desc: "Delivery failed. Contact support on WhatsApp for a refund." },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function isPhone(val: string) {
  return /^0[2-5]\d{8}$/.test(val.replace(/\s/g, ""));
}

function TrackContent() {
  const params = useSearchParams();
  const initialRef = params.get("ref") ?? "";

  const [query, setQuery]       = useState(initialRef);
  const [loading, setLoading]   = useState(false);
  const [order, setOrder]       = useState<OrderResult | null>(null);
  const [orders, setOrders]     = useState<OrderResult[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  const searchByRef = useCallback(async (ref: string, silent = false) => {
    const trimmed = ref.trim();
    if (!trimmed) return;
    if (!silent) { setLoading(true); setOrder(null); setOrders(null); setNotFound(false); }
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && data.order) { setOrder(data.order); setNotFound(false); }
      else if (!silent) setNotFound(true);
    } catch { if (!silent) setNotFound(true); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const searchByPhone = useCallback(async (phone: string) => {
    const cleaned = phone.replace(/\s/g, "");
    setLoading(true); setOrder(null); setOrders(null); setNotFound(false);
    try {
      const res = await fetch(`/api/orders/by-phone?phone=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (data.success && data.orders?.length > 0) { setOrders(data.orders); setNotFound(false); }
      else setNotFound(true);
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initialRef) searchByRef(initialRef);
  }, [initialRef, searchByRef]);

  // Poll every 5s while single order is still active
  useEffect(() => {
    const status = order?.status?.toLowerCase();
    if (status !== "processing" && status !== "pending") return;
    const id = setInterval(() => searchByRef(order!.reference, true), 5000);
    return () => clearInterval(id);
  }, [order?.status, order?.reference, searchByRef]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const val = query.trim();
    if (!val) return;
    if (isPhone(val)) await searchByPhone(val);
    else await searchByRef(val);
  }

  const st = order ? (STATUS[order.status?.toLowerCase()] ?? STATUS.pending) : null;
  const isActive = order && ["processing", "pending"].includes(order.status?.toLowerCase());
  const statusKey = order?.status?.toLowerCase() ?? "";

  return (
    <div style={{ background: D.bg, minHeight: "100vh", color: D.text }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "28px 16px 80px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <svg width={28} height={28} fill="none" stroke="#3b82f6" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: D.text, margin: "0 0 6px" }}>Track Your Order</h1>
          <p style={{ fontSize: 13, color: D.muted, margin: 0 }}>Enter your phone number or payment reference</p>
        </div>

        {/* Search form */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 6 }}>
                Phone Number or Payment Reference
              </label>
              <input
                type="text"
                placeholder="0241234567  or  elite-17123456789"
                value={query}
                onChange={e => { setQuery(e.target.value); setOrder(null); setOrders(null); setNotFound(false); }}
                style={{ width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: D.text, outline: "none", boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: D.muted, marginTop: 5 }}>
                Use your Ghana phone number (0241234567) to see all your orders, or paste the reference from your payment receipt.
              </p>
            </div>
            <button type="submit" disabled={loading} style={{
              width: "100%", background: D.blue, color: "white", border: "none", borderRadius: 12,
              padding: "13px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "Searching…" : "Track Order"}
            </button>
          </form>
        </div>

        {/* Multiple orders (phone lookup) */}
        {orders && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13, color: D.muted, margin: "0 0 4px", fontWeight: 600 }}>
              {orders.length} order{orders.length !== 1 ? "s" : ""} found for {query}
            </p>
            {orders.map(o => {
              const s = STATUS[o.status?.toLowerCase()] ?? STATUS.pending;
              return (
                <div key={o.reference} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${D.border}` }}>
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: D.text, margin: "0 0 2px" }}>
                        {(o.network ?? "").toUpperCase()} {o.bundle_size}
                      </p>
                      <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>{fmtDate(o.created_at)}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "white", margin: "0 0 3px" }}>GH₵{Number(o.amount).toFixed(2)}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: 10, color: D.muted, fontFamily: "monospace", margin: 0 }}>{o.reference}</p>
                    <button onClick={() => { setQuery(o.reference); searchByRef(o.reference); setOrders(null); }}
                      style={{ fontSize: 11, fontWeight: 700, color: D.blue, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                      View Details →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Single order detail */}
        {order && st && (
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16, overflow: "hidden" }}>
            {/* Status banner */}
            <div style={{ padding: "18px 20px", background: st.bg, borderBottom: `1px solid ${D.border}`, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 32 }} className={isActive ? "animate-pulse" : ""}>{st.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 20, fontWeight: 900, color: st.color, margin: 0 }}>{st.label}</p>
                  {isActive && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(59,130,246,0.2)", color: "#60a5fa", display: "flex", alignItems: "center", gap: 4 }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block animate-pulse" /> Live
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: D.muted, margin: "4px 0 0" }}>{st.desc}</p>
              </div>
            </div>

            {/* Progress bar */}
            {isActive && (
              <div style={{ padding: "14px 20px 0" }}>
                <div style={{ height: 6, borderRadius: 3, background: D.border, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                    width: statusKey === "processing" ? "65%" : "20%",
                    transition: "width 0.8s ease",
                  }} className="animate-pulse" />
                </div>
              </div>
            )}

            {/* Steps */}
            {statusKey !== "failed" && (
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${D.border}` }}>
                {[
                  { label: "Payment confirmed", done: true },
                  { label: "Order sent to provider", done: statusKey === "processing" || statusKey === "completed" },
                  { label: "Bundle delivered to your phone", done: statusKey === "completed" },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, border: `2px solid ${step.done ? "#22c55e" : D.border}`,
                      background: step.done ? "#22c55e" : "transparent", color: step.done ? "white" : D.muted,
                    }}>
                      {step.done ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 13, color: step.done ? D.text : D.muted, fontWeight: step.done ? 600 : 400 }}>{step.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Details */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Reference", value: <span style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{order.reference}</span> },
                order.network && order.bundle_size ? { label: "Bundle", value: `${order.network.toUpperCase()} ${order.bundle_size}` } : null,
                order.phone ? { label: "Phone", value: order.phone } : null,
                { label: "Amount", value: `GH₵ ${Number(order.amount).toFixed(2)}` },
                { label: "Date", value: fmtDate(order.created_at) },
              ].filter(Boolean).map((row, i) => row && (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 13, color: D.muted, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: 13, color: D.text, fontWeight: 600, textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Failed CTA */}
            {statusKey === "failed" && (
              <div style={{ padding: "0 20px 20px" }}>
                <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
                  style={{ display: "block", width: "100%", textAlign: "center", background: "#16a34a", color: "white", fontWeight: 800, padding: "13px", borderRadius: 12, textDecoration: "none", fontSize: 14, boxSizing: "border-box" }}>
                  Contact Support on WhatsApp
                </a>
              </div>
            )}
          </div>
        )}

        {/* Not found */}
        {notFound && (
          <div style={{ background: D.card, border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 14, padding: 20 }}>
            <p style={{ fontWeight: 700, color: "#fbbf24", margin: "0 0 6px" }}>Not found</p>
            <p style={{ fontSize: 13, color: D.muted, margin: "0 0 12px" }}>
              No order found for <strong style={{ color: D.text }}>{query}</strong>. Check the number or reference and try again.
            </p>
            <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", textDecoration: "none" }}>
              Contact us on WhatsApp →
            </a>
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
            style={{ fontSize: 13, color: D.blue, textDecoration: "none", fontWeight: 600 }}>
            Need help? Chat with us on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "#0d1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TrackContent />
    </Suspense>
  );
}
