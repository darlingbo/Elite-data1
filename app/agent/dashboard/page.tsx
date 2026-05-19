"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Order {
  reference: string;
  bundle_size: string;
  network: string;
  amount: number;
  agent_commission: number;
  status: string;
  created_at: string;
  phone: string;
}

interface AgentStats {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  commission_balance: number;
  total_sales: number;
  total_revenue: number;
  orders: Order[];
}

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );

function LoginForm({ onLogin }: { onLogin: (stats: AgentStats) => void }) {
  const [tab, setTab] = useState<"code" | "password">("password");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      let param = "";
      if (tab === "code") {
        if (!code.trim()) { setError("Enter your referral code."); setLoading(false); return; }
        param = `code=${encodeURIComponent(code.trim().toUpperCase())}`;
      } else {
        if (!email.trim() || !password) { setError("Enter your email and password."); setLoading(false); return; }
        param = `email=${encodeURIComponent(email.trim().toLowerCase())}&password=${encodeURIComponent(password)}`;
      }
      const res = await fetch(`/api/agents/dashboard?${param}`);
      const json = await res.json();
      if (json.success) {
        onLogin(json.agent);
      } else {
        setError(json.error || "Check your details and try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (forgotMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <button onClick={() => setForgotMode(false)} className="flex items-center gap-1 text-xs text-blue-600 font-semibold mb-4 hover:underline">
            ← Back to login
          </button>
          <h2 className="font-black text-gray-800 mb-1">Forgot Your Code?</h2>
          <p className="text-sm text-gray-500 mb-4">Two options to recover your access:</p>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-bold text-blue-800 mb-1">Login with Email</p>
              <p className="text-xs text-blue-700 mb-3">Switch to Email tab and log in without your code.</p>
              <button
                onClick={() => { setForgotMode(false); setTab("password"); }}
                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors"
              >
                Use Email Login →
              </button>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-bold text-green-800 mb-1">Contact Admin</p>
              <p className="text-xs text-green-700 mb-3">WhatsApp admin with your name + email.</p>
              <a
                href={`https://wa.me/233509794503?text=${encodeURIComponent("Hello Admin, I am an Elite Data agent and I forgot my referral code. My registered email is: ")}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-bold text-white bg-green-500 hover:bg-green-600 px-3 py-2 rounded-lg transition-colors"
              >
                WhatsApp Admin
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-black text-white">E</span>
          </div>
          <h1 className="text-white font-black text-2xl">Elite Data</h1>
          <p className="text-blue-200 text-sm mt-1">Agent Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="font-black text-gray-800 mb-1 text-lg">Welcome Back</h2>
          <p className="text-gray-400 text-xs mb-5">Sign in to your agent dashboard</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="flex bg-gray-100 rounded-xl p-1 mb-4 gap-1">
            <button
              onClick={() => { setTab("password"); setError(""); }}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${tab === "password" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Email & Password
            </button>
            <button
              onClick={() => { setTab("code"); setError(""); }}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${tab === "code" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Referral Code
            </button>
          </div>

          {tab === "password" ? (
            <div className="space-y-3 mb-4">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 pr-10"
                />
                <button type="button" onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
              <div className="text-right">
                <button onClick={() => setForgotMode(true)} className="text-xs text-blue-600 hover:underline font-medium">
                  Forgot password?
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="relative">
                <input
                  type={showCode ? "text" : "password"}
                  placeholder="e.g. KWA5ABC"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-gray-50 pr-10"
                />
                <button type="button" onClick={() => setShowCode((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  <EyeIcon open={showCode} />
                </button>
              </div>
              <div className="text-right mt-2">
                <button onClick={() => setForgotMode(true)} className="text-xs text-blue-600 hover:underline font-medium">
                  Forgot your code?
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Not yet an agent?{" "}
            <Link href="/agent" className="text-blue-600 font-semibold hover:underline">Apply here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function networkColor(network: string) {
  const n = network.toLowerCase();
  if (n === "mtn") return "bg-yellow-400 text-yellow-900";
  if (n === "telecel") return "bg-red-500 text-white";
  if (n === "airteltigo") return "bg-blue-500 text-white";
  return "bg-gray-400 text-white";
}

function statusBadge(status: string) {
  if (status === "COMPLETED") return "bg-green-100 text-green-700";
  if (status === "PROCESSING") return "bg-blue-100 text-blue-700";
  if (status === "FAILED") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

type NavPage = "dashboard" | "orders" | "link";

function AgentDashboard({ data, onLogout, onRefresh, refreshing }: {
  data: AgentStats;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [page, setPage] = useState<NavPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const host = typeof window !== "undefined" ? window.location.origin : "";
  const referralLink = `${host}/buy?agent=${data.referral_code}`;

  function copyLink() {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const initial = data.name?.charAt(0).toUpperCase() || "A";
  const completedOrders = data.orders.filter((o) => o.status === "COMPLETED");
  const totalEarned = completedOrders.reduce((sum, o) => sum + (o.agent_commission ?? 0), 0);

  const navItems: { id: NavPage; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: "orders",
      label: "My Orders",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: "link",
      label: "Referral Link",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
  ];

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-blue-700/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">E</span>
          </div>
          <div>
            <p className="text-white font-black text-sm leading-none">Elite Data</p>
            <p className="text-blue-300 text-xs">Agent Portal</p>
          </div>
        </div>
      </div>

      {/* Agent profile */}
      <div className="px-5 py-5 border-b border-blue-700/40">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center text-white font-black text-lg shadow-lg">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-white font-bold text-sm truncate">{data.name}</p>
            </div>
            <p className="text-blue-300 text-xs truncate">{data.email}</p>
          </div>
        </div>
        <div className="bg-blue-700/40 rounded-xl p-3">
          <p className="text-blue-300 text-xs mb-0.5">Commission Balance</p>
          <p className="text-white font-black text-xl">GH₵{(data.commission_balance ?? 0).toFixed(2)}</p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-blue-300">Code:</span>
          <span className="text-xs font-black text-yellow-300 bg-blue-700/50 px-2 py-0.5 rounded-md font-mono">{data.referral_code}</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-green-400">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block"></span>
            Online
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { setPage(item.id); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              page === item.id
                ? "bg-white/15 text-white"
                : "text-blue-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
            {item.id === "orders" && data.orders.length > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {data.orders.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-blue-700/40 space-y-1">
        <a
          href={`https://wa.me/233509794503?text=${encodeURIComponent(`Hello Admin, I'm agent ${data.name} (${data.referral_code}). I need help with my account.`)}`}
          target="_blank" rel="noreferrer"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-300 hover:bg-white/10 hover:text-white transition-all"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
          </svg>
          WhatsApp Support
        </a>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-300 hover:bg-red-500/20 hover:text-red-300 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );

  const MainContent = () => {
    if (page === "orders") {
      return (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-gray-800">My Orders</h2>
            <span className="text-sm text-gray-500">{data.orders.length} total</span>
          </div>
          {data.orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-500 font-semibold mb-1">No orders yet</p>
              <p className="text-gray-400 text-sm">Share your referral link to start earning commissions.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Order</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Bundle</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Phone</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Amount</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Commission</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o, i) => (
                      <tr key={o.reference} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-gray-500">{o.reference.slice(0, 14)}…</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${networkColor(o.network)}`}>
                              {o.network.toUpperCase()}
                            </span>
                            <span className="font-semibold text-gray-800">{o.bundle_size}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{o.phone}</td>
                        <td className="px-5 py-3.5 font-semibold text-gray-800">GH₵{(o.amount ?? 0).toFixed(2)}</td>
                        <td className="px-5 py-3.5 font-bold text-green-600">+GH₵{(o.agent_commission ?? 0).toFixed(2)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusBadge(o.status)}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (page === "link") {
      return (
        <div>
          <h2 className="text-xl font-black text-gray-800 mb-6">Your Referral Link</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm font-semibold text-gray-600 mb-3">Referral Link</p>
              <div className="flex items-center gap-2 mb-4">
                <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-700 break-all">{referralLink}</code>
                <button
                  onClick={copyLink}
                  className={`shrink-0 text-sm font-bold px-4 py-3 rounded-xl transition-colors text-white ${copied ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-gray-400">Anyone who buys through this link earns you a commission automatically.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Your Code</p>
              <p className="font-black text-3xl text-blue-700 font-mono">{data.referral_code}</p>
              <p className="text-xs text-gray-400 mt-2">Customers can enter this code at checkout.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Share via WhatsApp</p>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Buy cheap data bundles in Ghana! MTN, Telecel & AirtelTigo at the best prices. Use my link: ${referralLink}`)}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                </svg>
                Share on WhatsApp
              </a>
            </div>
          </div>
        </div>
      );
    }

    // Dashboard page
    return (
      <div className="space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-gray-800">Dashboard</h2>
            <p className="text-gray-400 text-sm">Welcome back, {data.name.split(" ")[0]}</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-300 text-gray-600 hover:text-blue-600 text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Balance card */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-12 translate-x-12"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-10 -translate-x-8"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">ELITE AGENT</span>
              <span className="flex items-center gap-1 text-xs text-green-300 font-semibold">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block"></span>
                Active
              </span>
            </div>
            <p className="text-blue-200 text-sm mb-1">Commission Balance</p>
            <p className="text-4xl font-black mb-4">GH₵{(data.commission_balance ?? 0).toFixed(2)}</p>
            <a
              href={`https://wa.me/233509794503?text=${encodeURIComponent(`Hello Admin, I'm agent ${data.name} (${data.referral_code}). I would like to withdraw my commission balance of GH₵${(data.commission_balance ?? 0).toFixed(2)}.`)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all backdrop-blur-sm border border-white/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Request Withdrawal
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <p className="text-2xl font-black text-gray-800">{data.total_sales ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Orders</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-2xl font-black text-gray-800">{totalEarned.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Earned (GH₵)</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-2xl font-black text-gray-800">GH₵{(data.total_revenue ?? 0).toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Revenue Generated</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={copyLink}
              className="flex flex-col items-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-blue-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-bold">{copied ? "Copied!" : "Copy Link"}</span>
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Buy cheap data bundles in Ghana! Use my link: ${referralLink}`)}`}
              target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-2 p-3 bg-green-50 hover:bg-green-100 rounded-xl transition-colors text-green-700"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
              </svg>
              <span className="text-xs font-bold">Share</span>
            </a>
            <button
              onClick={() => setPage("orders")}
              className="flex flex-col items-center gap-2 p-3 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors text-purple-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-xs font-bold">My Orders</span>
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex flex-col items-center gap-2 p-3 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors text-orange-700 disabled:opacity-50"
            >
              <svg className={`w-6 h-6 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-xs font-bold">Refresh</span>
            </button>
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Transactions</p>
            {data.orders.length > 5 && (
              <button onClick={() => setPage("orders")} className="text-xs text-blue-600 font-semibold hover:underline">
                View all
              </button>
            )}
          </div>
          {data.orders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No transactions yet.</p>
              <p className="text-gray-400 text-xs mt-1">Share your referral link to start earning!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.orders.slice(0, 8).map((o) => (
                <div key={o.reference} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${networkColor(o.network)}`}>
                    {o.network.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm">{o.network.toUpperCase()} {o.bundle_size}</p>
                    <p className="text-xs text-gray-400">{o.phone} · {new Date(o.created_at).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-green-600 text-sm">+GH₵{(o.agent_commission ?? 0).toFixed(2)}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(o.status)}`}>{o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed top-16 inset-x-0 bottom-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-16 bottom-0 left-0 lg:relative lg:top-auto lg:bottom-auto lg:inset-auto z-30 w-64 bg-gradient-to-b from-blue-900 to-blue-800 flex-shrink-0 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar />
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div>
            <p className="font-black text-gray-800 text-sm">Elite Data</p>
            <p className="text-gray-400 text-xs">Agent Portal</p>
          </div>
          <div className="ml-auto">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center text-white font-black text-sm">
              {initial}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <MainContent />
        </div>
      </main>
    </div>
  );
}

function DashboardContent() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const [data, setData] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  function fetchAgent(param: string, isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    fetch(`/api/agents/dashboard?${param}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.agent);
        else if (!isRefresh) setLoginError(json.error || "Not found.");
      })
      .catch(() => { if (!isRefresh) setLoginError("Network error."); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }

  useEffect(() => {
    if (code) {
      fetchAgent(`code=${encodeURIComponent(code.toUpperCase())}`);
    }
  }, [code]);

  function handleRefresh() {
    if (!data) return;
    fetchAgent(`code=${encodeURIComponent(data.referral_code)}`, true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-blue-200">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (loginError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-800 font-semibold mb-1">Access Denied</p>
          <p className="text-gray-500 text-sm mb-4">{loginError}</p>
          <button onClick={() => setLoginError("")} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <LoginForm onLogin={setData} />;
  }

  return (
    <AgentDashboard
      data={data}
      onLogout={() => setData(null)}
      onRefresh={handleRefresh}
      refreshing={refreshing}
    />
  );
}

export default function AgentDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
