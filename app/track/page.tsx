"use client";
import { useState } from "react";
import type { SubmitEvent as ReactSubmitEvent } from "react";
import type { OrderStatus } from "@/lib/supabase";

interface OrderResult {
  reference: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  network: string;
  bundle_size: string;
  amount: number;
  created_at: string;
}

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string; icon: string }> = {
  PENDING:    { label: "Pending",    color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200",  icon: "⏳" },
  PROCESSING: { label: "Processing", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",      icon: "🔄" },
  COMPLETED:  { label: "Completed",  color: "text-green-700",  bg: "bg-green-50 border-green-200",    icon: "✅" },
  FAILED:     { label: "Failed",     color: "text-red-700",    bg: "bg-red-50 border-red-200",        icon: "❌" },
};

export default function TrackPage() {
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function handleSearch(e: ReactSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = ref.trim();
    if (!trimmed) return;

    setLoading(true);
    setOrder(null);
    setNotFound(false);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && data.order) {
        setOrder(data.order);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-gray-800 mb-2">Track Your Order</h1>
        <p className="text-gray-500 text-sm">Enter your payment reference to check the status of your order</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Reference</label>
            <input
              type="text"
              placeholder="e.g. elite-1716000000000"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setOrder(null);
                setNotFound(false);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Your reference was shown after payment and sent to your email.</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            {loading ? "Searching..." : "Track Order"}
          </button>
        </form>

        {order && (() => {
          const s = statusConfig[order.status];
          return (
            <div className={`mt-6 border rounded-xl overflow-hidden`}>
              <div className={`${s.bg} border-b ${s.bg.split(" ")[1]} px-4 py-3 flex items-center gap-2`}>
                <span className="text-xl">{s.icon}</span>
                <div>
                  <p className={`font-bold ${s.color}`}>{s.label}</p>
                  <p className="text-xs text-gray-500">
                    {order.status === "COMPLETED" && "Bundle delivered successfully."}
                    {order.status === "PROCESSING" && "Your bundle is being delivered. Usually takes 1–5 minutes."}
                    {order.status === "PENDING" && "Order received, awaiting processing."}
                    {order.status === "FAILED" && "Delivery failed. Please contact support."}
                  </p>
                </div>
              </div>
              <div className="px-4 py-4 space-y-2 text-sm">
                <Row label="Reference" value={<span className="font-mono text-xs break-all">{order.reference}</span>} />
                <Row label="Bundle" value={`${order.network.toUpperCase()} ${order.bundle_size}`} />
                <Row label="Phone" value={order.phone} />
                <Row label="Amount" value={`GH₵ ${order.amount.toFixed(2)}`} />
                <Row label="Date" value={new Date(order.created_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })} />
              </div>
            </div>
          );
        })()}

        {notFound && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
            <p className="font-semibold text-yellow-800 mb-1">Order not found</p>
            <p className="text-yellow-700">
              No order found for reference <span className="font-mono font-bold">{ref}</span>.
              Please check the reference and try again, or contact support on WhatsApp.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        Need help?{" "}
        <a
          href="https://wa.me/233000000000"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 font-semibold hover:underline"
        >
          Chat with us on WhatsApp
        </a>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}
