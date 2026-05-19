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

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );

function LoginForm({ onLogin }: { onLogin: (stats: AgentStats) => void }) {
  const [byEmail, setByEmail] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);

  async function handleLogin() {
    if (!inputValue.trim()) return;
    setLoading(true);
    setError("");
    try {
      const param = byEmail
        ? `email=${encodeURIComponent(inputValue.trim().toLowerCase())}`
        : `code=${encodeURIComponent(inputValue.trim().toUpperCase())}`;
      const res = await fetch(`/api/agents/dashboard?${param}`);
      const json = await res.json();
      if (json.success) {
        onLogin(json.agent);
      } else {
        setError(json.error || "Not found. Check your details and try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (forgotMode) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <button onClick={() => setForgotMode(false)} className="flex items-center gap-1 text-xs text-blue-600 font-semibold mb-4 hover:underline">
          ← Back to login
        </button>
        <h2 className="font-black text-gray-800 mb-2">Forgot Your Referral Code?</h2>
        <p className="text-sm text-gray-500 mb-5">No problem. There are two options:</p>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-bold text-blue-800 mb-1">Option 1 — Log in with your email</p>
            <p className="text-sm text-blue-700 mb-3">If you remember the email you registered with, switch to the Email tab and log in without your referral code.</p>
            <button
              onClick={() => { setForgotMode(false); setByEmail(true); setInputValue(""); }}
              className="text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
            >
              Log in with Email →
            </button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-bold text-green-800 mb-1">Option 2 — Contact Admin on WhatsApp</p>
            <p className="text-sm text-green-700 mb-3">Message the admin with your full name and registered email. They will send you your referral code.</p>
            <a
              href={`https://wa.me/233509794503?text=${encodeURIComponent("Hello Admin, I am an Elite Data agent and I have forgotten my referral code. Please help me recover it. My registered email is: ")}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
              </svg>
              WhatsApp Admin
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="font-black text-gray-800 mb-1">Agent Login</h2>
      <p className="text-gray-400 text-xs mb-4">
        Enter your referral code or email address to view your dashboard.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4 gap-1">
        <button
          onClick={() => { setByEmail(false); setInputValue(""); setError(""); setShowCode(false); }}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${!byEmail ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}
        >
          Referral Code
        </button>
        <button
          onClick={() => { setByEmail(true); setInputValue(""); setError(""); }}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${byEmail ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}
        >
          Email Address
        </button>
      </div>

      {/* Input with show/hide toggle for referral code */}
      <div className="relative mb-1">
        <input
          type={!byEmail && !showCode ? "password" : byEmail ? "email" : "text"}
          placeholder={byEmail ? "you@example.com" : "e.g. KWA5ABC"}
          value={inputValue}
          onChange={(e) => setInputValue(byEmail ? e.target.value : e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && inputValue.trim() && handleLogin()}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono pr-10"
        />
        {!byEmail && (
          <button
            type="button"
            onClick={() => setShowCode((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            <EyeIcon open={showCode} />
          </button>
        )}
      </div>

      {/* Forgot code link */}
      {!byEmail && (
        <div className="mb-3 text-right">
          <button
            onClick={() => setForgotMode(true)}
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            Forgot your referral code?
          </button>
        </div>
      )}

      <button
        onClick={handleLogin}
        disabled={loading || !inputValue.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors mt-1"
      >
        {loading ? "Loading..." : "View Dashboard"}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3">
        Not yet an agent?{" "}
        <Link href="/agent" className="text-blue-600 font-semibold hover:underline">Apply here</Link>
      </p>
    </div>
  );
}

function DashboardContent() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const [data, setData] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (code) {
      setLoading(true);
      fetch(`/api/agents/dashboard?code=${encodeURIComponent(code.toUpperCase())}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success) setData(json.agent);
          else setLoginError(json.error || "Not found.");
        })
        .catch(() => setLoginError("Network error."))
        .finally(() => setLoading(false));
    }
  }, [code]);

  const host = typeof window !== "undefined" ? window.location.origin : "";
  const referralLink = data ? `${host}/buy?agent=${data.referral_code}` : "";
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <p className="text-center text-gray-500 py-10">Loading your dashboard...</p>;

  if (loginError) {
    return (
      <div className="max-w-sm mx-auto bg-red-50 border border-red-200 rounded-xl p-5 text-center">
        <p className="text-red-700 font-semibold mb-3">{loginError}</p>
        <button onClick={() => { setLoginError(""); }} className="text-blue-600 text-sm font-semibold hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data && !code) {
    return (
      <div className="max-w-sm mx-auto">
        <LoginForm onLogin={setData} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <p className="text-blue-200 text-sm mb-1">Welcome back,</p>
        <h2 className="text-2xl font-black mb-4">{data.name}</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-black text-yellow-300">GH₵{(data.commission_balance ?? 0).toFixed(2)}</p>
            <p className="text-blue-200 text-xs mt-0.5">Balance</p>
          </div>
          <div>
            <p className="text-2xl font-black">{data.total_sales ?? 0}</p>
            <p className="text-blue-200 text-xs mt-0.5">Total Sales</p>
          </div>
          <div>
            <p className="text-2xl font-black">GH₵{(data.total_revenue ?? 0).toFixed(2)}</p>
            <p className="text-blue-200 text-xs mt-0.5">Revenue</p>
          </div>
        </div>
      </div>

      {/* Referral link */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Referral Link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 break-all">{referralLink}</code>
          <button
            onClick={copyLink}
            className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg transition-colors text-white ${copied ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Share this link — anyone who buys through it earns you commission.</p>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Your code:</span>
          <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">{data.referral_code}</span>
        </div>
      </div>

      {/* Recent orders */}
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
                  <p className="font-bold text-green-600 text-sm">+GH₵{(o.agent_commission ?? 0).toFixed(2)}</p>
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
        <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:underline">
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
