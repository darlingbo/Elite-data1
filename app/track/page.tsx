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

interface VerifiedOrder {
  reference: string;
  customer_name: string;
  network: string;
  bundle_size: string;
  amount: number;
  phone: string;
}

const STATUS: Record<string, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  pending:          { label: "Pending",    color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "⏳", desc: "Order received — waiting to be sent to provider." },
  pending_approval: { label: "Processing", color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: "🔄", desc: "Your order has been received and is being processed. Bundle will be delivered shortly." },
  processing:       { label: "Processing", color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: "🔄", desc: "Provider is delivering your bundle. Usually 1–5 minutes." },
  completed:        { label: "Delivered",  color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "✅", desc: "Bundle delivered successfully to your phone!" },
  failed:           { label: "Failed",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "❌", desc: "Delivery failed. Click below to request your refund." },
  not_on_list:      { label: "Processing", color: "#f97316", bg: "rgba(249,115,22,0.12)",  icon: "🕒", desc: "This number is new to our system, so delivery can take up to 72 hours. No refund is needed — your data is on the way." },
  refunded:         { label: "Refunded",   color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "💸", desc: "Your refund has been processed. Please allow your payment provider time to complete settlement." },
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

  // Refund modal
  const [refundOpen, setRefundOpen]       = useState(false);
  const [refundStep, setRefundStep]       = useState<1 | 2 | 3>(1);
  const [verRef, setVerRef]               = useState("");
  const [verPhone, setVerPhone]           = useState("");
  const [verifying, setVerifying]         = useState(false);
  const [verError, setVerError]           = useState("");
  const [verifiedOrder, setVerifiedOrder] = useState<VerifiedOrder | null>(null);
  const [momoName, setMomoName]           = useState("");
  const [momoPhone, setMomoPhone]         = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [multipleOrders, setMultipleOrders] = useState<VerifiedOrder[]>([]);

  function openRefund(prefillRef?: string, prefillPhone?: string) {
    setVerRef(prefillRef ?? "");
    setVerPhone(prefillPhone ?? "");
    setVerifiedOrder(null);
    setVerError("");
    setMomoName("");
    setMomoPhone("");
    setSubmitError("");
    setMultipleOrders([]);
    setRefundStep(1);
    setRefundOpen(true);
  }

  async function handleVerify(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setVerifying(true);
    setVerError("");
    setMultipleOrders([]);
    try {
      const res = await fetch("/api/orders/verify-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: verRef.trim(), phone: verPhone.trim() }),
      });
      const data = await res.json();
      if (data.success && data.order) {
        setVerifiedOrder(data.order);
        setRefundStep(2);
      } else if (data.success && data.multiple) {
        setMultipleOrders(data.multiple);
      } else {
        setVerError(data.error ?? "Verification failed. Check your phone number and try again.");
      }
    } catch {
      setVerError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRefundSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/orders/manual-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: verifiedOrder?.reference ?? verRef.trim(),
          customerPhone: verifiedOrder?.phone,
          customerName: verifiedOrder?.customer_name,
          network: verifiedOrder?.network,
          bundleSize: verifiedOrder?.bundle_size,
          refundName: momoName.trim(),
          refundPhone: momoPhone.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRefundStep(3);
      } else {
        setSubmitError("Failed to submit. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
    if (status !== "processing" && status !== "pending" && status !== "pending_approval") return;
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
  const isActive = order && ["processing", "pending", "pending_approval"].includes(order.status?.toLowerCase());
  const statusKey = order?.status?.toLowerCase() ?? "";
  const isFailed = statusKey === "failed";

  return (
    <div style={{ background: D.bg, minHeight: "100vh", color: D.text }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "28px 16px 80px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <svg width={28} height={28} fill="none" stroke="#3b82f6" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: D.text, margin: "0 0 4px" }}>Track Your Order</h1>
          <p style={{ fontSize: 13, color: D.muted, margin: 0 }}>Enter your phone number or payment reference</p>
        </div>

        {/* Refund banner */}
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 16, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#f87171", margin: "0 0 2px" }}>💸 Need a Refund?</p>
            <p style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>Didn’t receive your data? Request a refund — processed within 12 hours.</p>
          </div>
          <button
            onClick={() => openRefund()}
            style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            Request Refund
          </button>
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
              const oFailed = o.status?.toLowerCase() === "failed";
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
                  <div style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 10, color: D.muted, fontFamily: "monospace", margin: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.reference}</p>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {oFailed && (
                        <button
                          onClick={() => openRefund(o.reference, query.replace(/\s/g, ""))}
                          style={{ fontSize: 11, fontWeight: 700, color: "#f87171", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                          💸 Refund
                        </button>
                      )}
                      <button onClick={() => { setQuery(o.reference); searchByRef(o.reference); setOrders(null); }}
                        style={{ fontSize: 11, fontWeight: 700, color: D.blue, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                        View Details →
                      </button>
                    </div>
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
            {!isFailed && (
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

            <div style={{ padding: "0 20px 20px", display: "flex", gap: 10, flexWrap: "wrap" }}>
              {statusKey === "completed" && (
                <button
                  onClick={() => window.print()}
                  style={{ flex: 1, minWidth: 140, background: D.bg, color: D.text, border: `1px solid ${D.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Print Receipt
                </button>
              )}
              {order.phone && order.network && order.bundle_size && (
                <a
                  href={`/buy?phone=${encodeURIComponent(order.phone)}&network=${encodeURIComponent(order.network)}&bundle=${encodeURIComponent(order.bundle_size)}`}
                  style={{ flex: 1, minWidth: 140, background: D.blue, color: "white", borderRadius: 10, padding: "11px 14px", fontSize: 13, fontWeight: 800, textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
                  Buy Again
                </a>
              )}
            </div>

            {/* Failed — in-app refund */}
            {isFailed && (
              <div style={{ margin: "0 20px 20px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 14, padding: "16px 18px" }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#f87171", margin: "0 0 6px" }}>💸 Refund Available</p>
                <p style={{ fontSize: 13, color: D.muted, margin: "0 0 16px", lineHeight: 1.5 }}>
                  Your payment of <strong style={{ color: "white" }}>GH₵{Number(order.amount).toFixed(2)}</strong> was charged but the bundle was not delivered.
                  Request your refund below — it will be processed within 12 hours.
                </p>
                <button
                  onClick={() => openRefund(order.reference, order.phone ?? "")}
                  style={{ display: "block", width: "100%", textAlign: "center", background: "#ef4444", color: "white", fontWeight: 800, padding: "13px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, boxSizing: "border-box" }}>
                  💸 Request Refund
                </button>
                <p style={{ fontSize: 11, color: D.muted, margin: "10px 0 0", textAlign: "center" }}>
                  Refunds are processed within 12 hours. If not received, contact our help line.
                </p>
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

      {/* ── Refund Modal ──────────────────────────────────────────────────────── */}
      {refundOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setRefundOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#161b22", border: "1px solid #21262d", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "28px 24px 48px", width: "100%", maxWidth: 480 }}>

            {/* Step 1: Verify identity */}
            {refundStep === 1 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <p style={{ fontSize: 18, fontWeight: 900, color: D.text, margin: "0 0 4px" }}>💸 Request a Refund</p>
                    <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>Step 1 of 2 · Verify your identity</p>
                  </div>
                  <button onClick={() => setRefundOpen(false)} style={{ background: "transparent", border: "none", color: D.muted, fontSize: 24, cursor: "pointer", lineHeight: 1, paddingTop: 2 }}>×</button>
                </div>
                <p style={{ fontSize: 13, color: D.muted, marginBottom: 20, lineHeight: 1.6 }}>
                  Enter the <strong style={{ color: D.text }}>phone number</strong> you used to buy. If you have your reference, add it too — otherwise leave it blank.
                </p>
                <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 6 }}>Phone Number Used to Buy <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="tel"
                      placeholder="0241234567"
                      value={verPhone}
                      onChange={e => setVerPhone(e.target.value)}
                      required
                      style={{ width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: D.text, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 6 }}>
                      Order Reference <span style={{ fontWeight: 400, color: D.muted }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="elite-17123456789 — leave blank if you don't have it"
                      value={verRef}
                      onChange={e => setVerRef(e.target.value)}
                      autoCapitalize="none"
                      style={{ width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: D.text, outline: "none", boxSizing: "border-box" }}
                    />
                    <p style={{ fontSize: 11, color: D.muted, margin: "4px 0 0" }}>Find it in your SMS or order confirmation email</p>
                  </div>
                  {verError && (
                    <div style={{ fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px" }}>
                      ⚠️ {verError}
                    </div>
                  )}
                  {/* Multiple failed orders picker */}
                  {multipleOrders.length > 0 && (
                    <div>
                      <p style={{ fontSize: 13, color: "#fbbf24", margin: "0 0 10px", fontWeight: 700 }}>
                        ⚠️ We found {multipleOrders.length} failed orders for this number. Pick the one you want refunded:
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {multipleOrders.map(o => (
                          <button
                            key={o.reference}
                            type="button"
                            onClick={() => { setVerifiedOrder(o); setRefundStep(2); }}
                            style={{ background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", textAlign: "left", cursor: "pointer", color: D.text }}>
                            <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14 }}>
                              {(o.network ?? "").toUpperCase()} {o.bundle_size} · GH₵{Number(o.amount).toFixed(2)}
                            </p>
                            <p style={{ margin: 0, fontSize: 11, color: D.muted }}>Ref: {o.reference}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {multipleOrders.length === 0 && (
                    <button type="submit" disabled={verifying} style={{ background: D.blue, color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: verifying ? 0.6 : 1, marginTop: 4 }}>
                      {verifying ? "Verifying…" : "Find My Order →"}
                    </button>
                  )}
                </form>
              </>
            )}

            {/* Step 2: MoMo details */}
            {refundStep === 2 && verifiedOrder && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 18, fontWeight: 900, color: D.text, margin: "0 0 4px" }}>💸 Refund Details</p>
                    <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>Step 2 of 2 · Where to send your money</p>
                  </div>
                  <button onClick={() => setRefundOpen(false)} style={{ background: "transparent", border: "none", color: D.muted, fontSize: 24, cursor: "pointer", lineHeight: 1, paddingTop: 2 }}>×</button>
                </div>

                <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", margin: "0 0 6px" }}>✅ Identity verified</p>
                  <p style={{ fontSize: 13, color: D.text, margin: "0 0 2px", fontWeight: 600 }}>
                    {(verifiedOrder.network ?? "").toUpperCase()} {verifiedOrder.bundle_size}
                  </p>
                  <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>
                    Refund: <strong style={{ color: "white" }}>GH₵{Number(verifiedOrder.amount).toFixed(2)}</strong>
                  </p>
                </div>

                <form onSubmit={handleRefundSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 6 }}>MoMo Account Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Kwame Mensah"
                      value={momoName}
                      onChange={e => setMomoName(e.target.value)}
                      required
                      style={{ width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: D.text, outline: "none", boxSizing: "border-box" }}
                    />
                    <p style={{ fontSize: 11, color: D.muted, margin: "4px 0 0" }}>The name on your Mobile Money account</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: D.muted, display: "block", marginBottom: 6 }}>MoMo Number</label>
                    <input
                      type="tel"
                      placeholder="0241234567"
                      value={momoPhone}
                      onChange={e => setMomoPhone(e.target.value)}
                      required
                      style={{ width: "100%", background: D.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: D.text, outline: "none", boxSizing: "border-box" }}
                    />
                    <p style={{ fontSize: 11, color: D.muted, margin: "4px 0 0" }}>The number to receive your refund</p>
                  </div>
                  {submitError && (
                    <div style={{ fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px" }}>
                      ⚠️ {submitError}
                    </div>
                  )}
                  <button type="submit" disabled={submitting} style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: submitting ? 0.6 : 1, marginTop: 4 }}>
                    {submitting ? "Submitting…" : "Submit Refund Request"}
                  </button>
                </form>
              </>
            )}

            {/* Step 3: Success */}
            {refundStep === 3 && (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
                <p style={{ fontSize: 20, fontWeight: 900, color: D.text, margin: "0 0 12px" }}>Refund Request Sent!</p>
                <p style={{ fontSize: 14, color: D.muted, margin: "0 0 8px", lineHeight: 1.7 }}>
                  Your refund request has been received. The admin will process your refund within <strong style={{ color: "white" }}>12 hours</strong>.
                </p>
                <p style={{ fontSize: 13, color: D.muted, margin: "0 0 28px" }}>
                  If you do not receive your money after 12 hours, please contact our help line.
                </p>
                <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", fontSize: 13, color: "#22c55e", textDecoration: "none", fontWeight: 700, marginBottom: 20 }}>
                  Contact Help Line →
                </a>
                <br />
                <button onClick={() => setRefundOpen(false)}
                  style={{ background: D.blue, color: "white", border: "none", borderRadius: 12, padding: "13px 36px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            )}

          </div>
        </div>
      )}
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
