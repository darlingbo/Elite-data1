"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface AgentStats {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  commission_balance: number;
  total_sales: number;
  total_revenue: number;
  orders: Array<{
    reference: string;
    bundle_size: string;
    network: string;
    amount: number;
    agent_commission: number;
    status: string;
    created_at: string;
    phone: string;
  }>;
}

function DashboardContent() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const [data, setData] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inputCode, setInputCode] = useState(code);

  useEffect(() => {
    if (code) load(code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function load(c: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/agents/dashboard?code=${encodeURIComponent(c.toUpperCase())}`);
      const json = await res.json();
      if (json.success) {
        setData(json.agent);
      } else {
        setError(json.error || "Agent not found. Check your referral code.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const host = typeof window !== "undefined" ? window.location.origin : "https://yoursite.com";
  const referralLink = data ? `${host}/buy?agent=${data.referral_code}` : "";

  if (!code && !data) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-black text-gray-800 mb-4">Enter Your Referral Code</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <input
            type="text"
            placeholder="e.g. KWA5ABC"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <button
            onClick={() => load(inputCode)}
            disabled={loading || !inputCode.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors"
          >
            {loading ? "Loading..." : "View Dashboard"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center text-gray-500 py-10">Loading your dashboard...</p>;
  }

  if (error) {
    return (
      <div className="max-w-sm mx-auto bg-red-50 border border-red-200 rounded-xl p-5 text-center">
        <p className="text-red-700 font-semibold mb-3">{error}</p>
        <button onClick={() => { setData(null); setError(""); }} className="text-blue-600 text-sm font-semibold hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <p className="text-blue-200 text-sm mb-1">Welcome back,</p>
        <h2 className="text-2xl font-black mb-4">{data.name}</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-black text-yellow-300">GH₵{data.commission_balance.toFixed(2)}</p>
            <p className="text-blue-200 text-xs mt-0.5">Balance</p>
          </div>
          <div>
            <p className="text-2xl font-black">{data.total_sales}</p>
            <p className="text-blue-200 text-xs mt-0.5">Total Sales</p>
          </div>
          <div>
            <p className="text-2xl font-black">GH₵{data.total_revenue.toFixed(2)}</p>
            <p className="text-blue-200 text-xs mt-0.5">Revenue</p>
          </div>
        </div>
      </div>

      {/* Referral Link */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Referral Link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 break-all">{referralLink}</code>
          <button
            onClick={() => navigator.clipboard.writeText(referralLink)}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Share this link. Anyone who buys through it earns you commission.</p>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Recent Sales</p>
        {data.orders.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No sales yet. Share your referral link to get started!</p>
        ) : (
          <div className="space-y-3">
            {data.orders.map((o) => (
              <div key={o.reference} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{o.network.toUpperCase()} {o.bundle_size}</p>
                  <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("en-GH")}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600 text-sm">+GH₵{o.agent_commission.toFixed(2)}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    o.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                    o.status === "PROCESSING" ? "bg-blue-100 text-blue-700" :
                    o.status === "FAILED" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-sm text-gray-500">
        Need help?{" "}
        <a href="https://wa.me/233000000000" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:underline">
          WhatsApp Support
        </a>
      </div>
    </div>
  );
}

export default function AgentDashboardPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-800">Agent Dashboard</h1>
          <p className="text-gray-500 text-sm">Track your sales and commissions</p>
        </div>
        <Link href="/agent" className="text-blue-600 text-sm font-semibold hover:underline">
          ← Agent Home
        </Link>
      </div>
      <Suspense fallback={<p className="text-center text-gray-400">Loading...</p>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
