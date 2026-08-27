"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface OrderData {
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

const BG     = "#080f1e";
const CARD   = "#0d1b2e";
const BORDER = "#1e3a5f";
const TEXT   = "#f8fafc";
const MUTED  = "#94a3b8";
const SUB    = "#64748b";
const YELLOW = "#fbbf24";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  pending:          { label: "Received",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "⏳", desc: "Your order has been received and is in the queue." },
  pending_approval: { label: "Processing", color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: "🔄", desc: "Your order has been received and is being processed. Bundle will be delivered shortly." },
  processing:       { label: "Processing", color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  icon: "🔄", desc: "Your bundle is being sent to your phone — usually 1–5 minutes." },
  completed:        { label: "Delivered ✓",color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "✅", desc: "Your bundle has been delivered successfully!" },
  failed:           { label: "Failed",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "❌", desc: "Delivery failed. Please contact us on WhatsApp for a refund or retry." },
  not_on_list:      { label: "Failed",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "❌", desc: "Delivery failed. Please contact us on WhatsApp for a refund or retry." },
  refunded:         { label: "Refunded",   color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: "💸", desc: "Your refund has been processed. Please allow your provider time to settle." },
  rejected:         { label: "Rejected",   color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: "🚫", desc: "Your order was rejected. Please contact us on WhatsApp." },
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ color: MUTED, fontSize: 13 }}>{label}</span>
      <span style={{ color: TEXT, fontSize: 13, fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

export default function OrderPage() {
  const params = useParams();
  const reference = (params?.reference as string) ?? "";

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!reference) return;
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(reference)}`);
      const d = await r.json();
      if (d.success && d.order) {
        setOrder(d.order);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    fetchOrder();
    // Auto-refresh every 30s for in-progress orders
    const id = setInterval(() => {
      setOrder((prev) => {
        const s = prev?.status ?? "";
        if (s === "completed" || s === "failed" || s === "refunded" || s === "rejected") return prev;
        fetchOrder();
        return prev;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchOrder]);

  const st = order ? (STATUS_MAP[order.status] ?? STATUS_MAP["pending"]) : null;
  const isTerminal = order && ["completed", "failed", "refunded", "rejected", "not_on_list"].includes(order.status);
  const isFailed   = order && ["failed", "not_on_list", "rejected"].includes(order.status);

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "40px 16px 80px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>

        {/* Back link */}
        <Link href="/track" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 13, textDecoration: "none", marginBottom: 24 }}>
          ← Back to Order Tracker
        </Link>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ color: MUTED, fontSize: 15 }}>Loading order…</div>
          </div>
        )}

        {/* Not found */}
        {!loading && notFound && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 20, margin: "0 0 10px" }}>Order not found</h2>
            <p style={{ color: MUTED, fontSize: 14, margin: "0 0 24px" }}>
              We couldn&apos;t find an order with reference <strong style={{ color: TEXT }}>{reference}</strong>. Please check the reference and try again.
            </p>
            <Link href="/track" style={{ display: "inline-flex", alignItems: "center", background: YELLOW, color: "#0d0d0d", fontWeight: 800, padding: "12px 24px", borderRadius: 12, textDecoration: "none", fontSize: 14 }}>
              Try Again
            </Link>
          </div>
        )}

        {/* Order found */}
        {!loading && order && st && (
          <>
            {/* Status banner */}
            <div style={{
              background: st.bg, border: `1px solid ${st.color}33`,
              borderRadius: 20, padding: "28px 24px",
              textAlign: "center", marginBottom: 16,
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{st.icon}</div>
              <div style={{ color: st.color, fontWeight: 800, fontSize: 20, marginBottom: 8 }}>{st.label}</div>
              <p style={{ color: TEXT, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{st.desc}</p>
              {!isTerminal && (
                <p style={{ color: SUB, fontSize: 12, marginTop: 12, margin: "12px 0 0" }}>
                  This page refreshes automatically every 30 seconds
                </p>
              )}
            </div>

            {/* Order details */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "20px 20px 4px", marginBottom: 16 }}>
              <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
                Order Details
              </h3>
              <InfoRow label="Reference" value={order.reference} />
              {order.customer_name && <InfoRow label="Name" value={order.customer_name} />}
              <InfoRow label="Phone" value={order.phone} />
              <InfoRow label="Network" value={order.network} />
              <InfoRow label="Bundle" value={order.bundle_size} />
              <InfoRow label="Amount Paid" value={order.amount ? `GH₵${Number(order.amount).toFixed(2)}` : undefined} />
              <InfoRow label="Date" value={order.created_at ? new Date(order.created_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" }) : undefined} />
              {order.inventor_message && order.inventor_message !== order.status && (
                <InfoRow label="Provider Message" value={order.inventor_message} />
              )}
              <div style={{ height: 16 }} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {order.status === "completed" && (
                <Link href="/buy" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: YELLOW, color: "#0d0d0d", fontWeight: 800, padding: "14px", borderRadius: 14, textDecoration: "none", fontSize: 15 }}>
                  ⚡ Buy Another Bundle
                </Link>
              )}
              {isFailed && (
                <a
                  href={`https://wa.me/233509794503?text=${encodeURIComponent(`Hi, my order ${order.reference} failed. Can you help me with a refund or retry?`)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#16a34a", color: "#fff", fontWeight: 800, padding: "14px", borderRadius: 14, textDecoration: "none", fontSize: 15 }}
                >
                  💬 Request Refund on WhatsApp
                </a>
              )}
              <button
                onClick={() => { setLoading(true); fetchOrder(); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, color: TEXT, fontWeight: 600, padding: "13px", borderRadius: 14, cursor: "pointer", fontSize: 14 }}
              >
                🔄 Refresh Status
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

