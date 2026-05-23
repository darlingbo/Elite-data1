"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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

const STATUS: Record<string, { label: string; color: string; bg: string; border: string; icon: string; desc: string }> = {
  pending:    { label: "Pending",    color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: "⏳", desc: "Order received — waiting to be sent to provider." },
  processing: { label: "Processing", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", icon: "🔄", desc: "Provider is delivering your bundle. Usually 1–5 minutes." },
  completed:  { label: "Delivered",  color: "#047857", bg: "#f0fdf4", border: "#6ee7b7", icon: "✅", desc: "Bundle delivered successfully to your phone!" },
  failed:     { label: "Failed",     color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", icon: "❌", desc: "Delivery failed. Contact support on WhatsApp for a refund." },
};

function TrackContent() {
  const params = useSearchParams();
  const initialRef = params.get("ref") ?? "";

  const [ref, setRef] = useState(initialRef);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  const doSearch = useCallback(async (searchRef: string, silent = false) => {
    const trimmed = searchRef.trim();
    if (!trimmed) return;
    if (!silent) { setLoading(true); setOrder(null); setNotFound(false); }
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && data.order) {
        setOrder(data.order);
        setNotFound(false);
      } else if (!silent) {
        setNotFound(true);
      }
    } catch {
      if (!silent) setNotFound(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Auto-load when ref is in URL
  useEffect(() => {
    if (initialRef) doSearch(initialRef);
  }, [initialRef, doSearch]);

  // Poll every 5 seconds while order is pending or processing
  useEffect(() => {
    const status = order?.status?.toLowerCase();
    if (status !== "processing" && status !== "pending") return;
    const id = setInterval(() => doSearch(order!.reference, true), 5000);
    return () => clearInterval(id);
  }, [order?.status, order?.reference, doSearch]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    await doSearch(ref);
  }

  const st = order ? (STATUS[order.status?.toLowerCase()] ?? STATUS.pending) : null;
  const isActive = order && ["processing", "pending"].includes(order.status?.toLowerCase());
  const statusKey = order?.status?.toLowerCase() ?? "";

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-gray-800 mb-2">Track Your Order</h1>
        <p className="text-gray-500 text-sm">Status updates automatically every 5 seconds while processing</p>
      </div>

      {/* Search form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Reference</label>
            <input
              type="text"
              placeholder="e.g. elite-1716000000000"
              value={ref}
              onChange={(e) => { setRef(e.target.value); setOrder(null); setNotFound(false); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Your reference was shown right after payment.</p>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm">
            {loading ? "Searching…" : "Track Order"}
          </button>
        </form>
      </div>

      {/* Order result */}
      {order && st && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Status banner */}
          <div className="px-5 py-4 flex items-center gap-4" style={{ background: st.bg, borderBottom: `1.5px solid ${st.border}` }}>
            <span className={`text-3xl ${isActive ? "animate-pulse" : ""}`}>{st.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-xl" style={{ color: st.color }}>{st.label}</p>
                {isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{st.desc}</p>
            </div>
          </div>

          {/* Animated progress bar */}
          {isActive && (
            <div className="px-5 pt-4">
              <div className="h-2 rounded-full overflow-hidden bg-gray-100">
                <div className="h-full rounded-full" style={{
                  background: "linear-gradient(90deg,#3b82f6,#8b5cf6)",
                  width: statusKey === "processing" ? "65%" : "20%",
                  transition: "width 0.8s ease",
                  animation: "shimmer 1.8s ease-in-out infinite",
                }} />
              </div>
              <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
            </div>
          )}

          {/* Progress steps */}
          {statusKey !== "failed" && (
            <div className="px-5 py-4">
              {[
                { label: "Payment confirmed by Paystack", done: true },
                { label: "Order sent to Inventor DataHub", done: statusKey === "processing" || statusKey === "completed" },
                { label: "Bundle delivered to your phone", done: statusKey === "completed" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 border-2 transition-all ${
                    step.done ? "bg-green-500 border-green-500 text-white" : "bg-white border-gray-200 text-gray-400"
                  }`}>
                    {step.done ? "✓" : i + 1}
                  </div>
                  <span className={`text-sm ${step.done ? "text-gray-800 font-semibold" : "text-gray-400"}`}>{step.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Order details */}
          <div className="px-5 py-4 border-t border-gray-100 space-y-2.5 text-sm">
            <Row label="Reference" value={<span className="font-mono text-xs break-all">{order.reference}</span>} />
            {order.network && order.bundle_size && (
              <Row label="Bundle" value={`${order.network.toUpperCase()} ${order.bundle_size}`} />
            )}
            {order.phone && <Row label="Phone" value={order.phone} />}
            <Row label="Amount" value={`GH₵ ${Number(order.amount).toFixed(2)}`} />
            <Row label="Date" value={new Date(order.created_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })} />
            {order.inventor_status && (
              <div className="pt-2 mt-1 border-t border-gray-100">
                <Row label="Provider Status" value={
                  <span className="text-xs font-medium">
                    {order.inventor_status}
                    {order.inventor_message && order.inventor_message !== order.inventor_status && (
                      <span className="block text-gray-400 font-normal">{order.inventor_message}</span>
                    )}
                  </span>
                } />
              </div>
            )}
          </div>

          {/* WhatsApp CTA for failed */}
          {statusKey === "failed" && (
            <div className="px-5 pb-5">
              <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
                className="block w-full text-center bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                Contact Support on WhatsApp
              </a>
            </div>
          )}
        </div>
      )}

      {notFound && (
        <div className="bg-white rounded-2xl shadow-sm border border-yellow-100 p-5">
          <p className="font-semibold text-yellow-800 mb-1">Order not found</p>
          <p className="text-sm text-yellow-700">
            No order found for <span className="font-mono font-bold">{ref}</span>. Double-check the reference,
            or{" "}
            <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold underline">
              contact us on WhatsApp
            </a>.
          </p>
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        Need help?{" "}
        <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:underline">
          Chat with us on WhatsApp
        </a>
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-20 text-center text-gray-400">Loading…</div>}>
      <TrackContent />
    </Suspense>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}
