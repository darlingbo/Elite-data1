"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import CheckoutModal from "@/components/CheckoutModal";
import type { Bundle } from "@/lib/bundles";

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
  agent_type?: "commission" | "custom_price";
  orders: Order[];
}

type NavPage = "dashboard" | "buy" | "orders" | "link" | "prices" | "shop";

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

function networkBadge(network: string) {
  const n = network.toLowerCase();
  if (n === "mtn") return "bg-yellow-400 text-yellow-900";
  if (n === "telecel") return "bg-red-500 text-white";
  return "bg-blue-500 text-white";
}

function statusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === "completed") return "bg-green-100 text-green-700";
  if (s === "processing") return "bg-blue-100 text-blue-700";
  if (s === "failed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

/* ─── Login Form ─── */
function LoginForm({ onLogin }: { onLogin: (stats: AgentStats) => void }) {
  const [tab, setTab] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);

  async function handleLogin() {
    setError("");
    setLoading(true);
    try {
      let res: Response;
      if (tab === "code") {
        if (!code.trim()) { setError("Enter your referral code."); return; }
        res = await fetch(`/api/agents/dashboard?code=${encodeURIComponent(code.trim().toUpperCase())}`);
      } else {
        if (!email.trim() || !password) { setError("Enter your email and password."); return; }
        res = await fetch("/api/agents/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
      }
      const json = await res.json();
      if (json.success) onLogin(json.agent);
      else setError(json.error || "Check your details and try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (forgot) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <button onClick={() => setForgot(false)} className="text-xs text-blue-600 font-semibold mb-4 hover:underline">← Back</button>
          <h2 className="font-black text-gray-800 mb-1">Forgot Your Code?</h2>
          <p className="text-sm text-gray-500 mb-4">Two options:</p>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-bold text-blue-800 mb-1">Log in with Email</p>
              <button onClick={() => { setForgot(false); setTab("password"); }}
                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors">
                Use Email Login →
              </button>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-bold text-green-800 mb-1">Contact Admin on WhatsApp</p>
              <a href={`https://wa.me/233509794503?text=${encodeURIComponent("Hello Admin, I forgot my Elite Data agent referral code. My email is: ")}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-white bg-green-500 hover:bg-green-600 px-3 py-2 rounded-lg transition-colors">
                WhatsApp Admin
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-black text-white">E</span>
          </div>
          <h1 className="text-white font-black text-2xl">Elite Data</h1>
          <p className="text-blue-200 text-sm mt-1">Agent Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="font-black text-gray-800 text-lg mb-1">Welcome Back</h2>
          <p className="text-gray-400 text-xs mb-5">Sign in to your agent dashboard</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg mb-4">{error}</div>
          )}

          <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
            <button onClick={() => { setTab("password"); setError(""); }}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${tab === "password" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500"}`}>
              Email &amp; Password
            </button>
            <button onClick={() => { setTab("code"); setError(""); }}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${tab === "code" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500"}`}>
              Referral Code
            </button>
          </div>

          {tab === "password" ? (
            <div className="space-y-3 mb-4">
              <input type="email" placeholder="your@email.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
              <div className="relative">
                <input type={showPw ? "text" : "password"} placeholder="Your password" value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 pr-10" />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" tabIndex={-1}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
              <div className="text-right">
                <button onClick={() => setForgot(true)} className="text-xs text-blue-600 hover:underline">Forgot password?</button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="relative">
                <input type={showCode ? "text" : "password"} placeholder="e.g. KWA5ABC" value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-gray-50 pr-10" />
                <button type="button" onClick={() => setShowCode(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" tabIndex={-1}>
                  <EyeIcon open={showCode} />
                </button>
              </div>
              <div className="text-right mt-2">
                <button onClick={() => setForgot(true)} className="text-xs text-blue-600 hover:underline">Forgot your code?</button>
              </div>
            </div>
          )}

          <button onClick={handleLogin} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors">
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Not an agent yet?{" "}
            <Link href="/agent" className="text-blue-600 font-semibold hover:underline">Apply here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Withdrawal Modal ─── */
function WithdrawalModal({ agent, onClose }: { agent: AgentStats; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("MTN MoMo");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const max = agent.commission_balance ?? 0;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt < 50) { setError("Minimum withdrawal is GH₵50."); return; }
    if (amt > max) { setError(`You only have GH₵${max.toFixed(2)} available.`); return; }
    if (!accountNumber.trim()) { setError("Enter your mobile money number."); return; }
    if (!accountName.trim()) { setError("Enter the account name."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/agents/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, referralCode: agent.referral_code, name: agent.name, amount: amt, method, accountNumber: accountNumber.trim(), accountName: accountName.trim() }),
      });
      const d = await res.json();
      if (d.success) setSuccess(true);
      else setError(d.error || "Failed to submit. Please try again.");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        {success ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-black text-gray-800 text-lg mb-2">Payment Sent!</h3>
            <p className="text-gray-500 text-sm mb-5">Your money is on its way to your mobile money account. It should arrive within a few minutes.</p>
            <button onClick={onClose} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl text-sm">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-gray-800 text-lg">Withdraw Funds</h3>
                <p className="text-xs text-gray-400">Available: GH₵{max.toFixed(2)}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg">{error}</div>}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Amount to Withdraw (GH₵) *</label>
                <input type="number" placeholder={`Max GH₵${max.toFixed(2)}`} value={amount}
                  onChange={(e) => setAmount(e.target.value)} min="5" max={max} step="0.01"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Payment Method *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "MTN MoMo", color: "border-yellow-400 bg-yellow-50 text-yellow-700" },
                    { label: "Telecel Cash", color: "border-red-400 bg-red-50 text-red-700" },
                    { label: "AirtelTigo", color: "border-blue-400 bg-blue-50 text-blue-700" },
                  ].map(({ label, color }) => (
                    <button key={label} type="button" onClick={() => setMethod(label)}
                      className={`py-2.5 px-1 rounded-xl text-xs font-bold border-2 transition-all ${method === label ? color : "border-gray-200 text-gray-400 bg-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile Money Number *</label>
                <input type="tel" placeholder="e.g. 0241234567" value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Account Name *</label>
                <input type="text" placeholder="Name registered on the account" value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-700">Min. withdrawal: GH₵50 · Sent instantly to your MoMo</p>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                {loading ? "Processing…" : "Withdraw Now"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Logged-in Dashboard ─── */
function Dashboard({ data, onLogout, onRefresh, refreshing }: {
  data: AgentStats;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [page, setPage] = useState<NavPage>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(!data.agent_type);
  const [localAgentType, setLocalAgentType] = useState<"commission" | "custom_price" | null>(data.agent_type ?? null);

  const effectiveType = localAgentType ?? data.agent_type ?? null;
  const isTestAccount = data.email === "stephen@gmail.com";

  const host = typeof window !== "undefined" ? window.location.origin : "https://elite-data1.vercel.app";
  const referralLink = `${host}/buy?agent=${data.referral_code}`;
  const initial = data.name?.charAt(0).toUpperCase() || "A";
  const completedOrders = data.orders.filter(o => o.status?.toLowerCase() === "completed");
  const totalEarned = completedOrders.reduce((s, o) => s + (o.agent_commission ?? 0), 0);

  function copyLink() {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeSidebar() { setSidebarOpen(false); }

  return (
    <>
    {showWithdraw && <WithdrawalModal agent={data} onClose={() => setShowWithdraw(false)} />}
    {typeModalOpen && !effectiveType && (
      <AgentTypeModal
        agentId={data.id}
        referralCode={data.referral_code ?? ""}
        onChosen={(type) => {
          setLocalAgentType(type);
          setTypeModalOpen(false);
          if (type !== "custom_price" && page === "prices") setPage("dashboard");
          onRefresh();
        }}
      />
    )}
    <div className="flex" style={{ height: "100vh" }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={closeSidebar} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-30 w-64 overflow-y-auto
        bg-gradient-to-b from-blue-900 to-blue-800 flex flex-col flex-shrink-0
        transition-transform duration-300
        lg:sticky lg:top-0 lg:translate-x-0 lg:h-screen
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Brand */}
        <div className="px-5 py-4 border-b border-white/10">
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
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{data.name}</p>
              <p className="text-blue-300 text-xs truncate">{data.email}</p>
            </div>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-blue-300 text-xs mb-0.5">Commission Balance</p>
            <p className="text-white font-black text-xl">GH₵{(data.commission_balance ?? 0).toFixed(2)}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-blue-300">Code:</span>
            <span className="text-xs font-black text-yellow-300 bg-white/10 px-2 py-0.5 rounded font-mono">{data.referral_code}</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-semibold">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
              Online
            </span>
          </div>

          {/* Agent mode — locked after first choice (test account can always switch) */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-blue-300 mb-2 font-semibold">Agent Mode</p>
            {isTestAccount ? (
              <div className="flex gap-1 bg-white/10 rounded-xl p-1">
                <button onClick={async () => { await fetch("/api/agents/switch-type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: data.id, agentType: "commission", referralCode: data.referral_code }) }); setLocalAgentType("commission"); onRefresh(); }}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all ${effectiveType !== "custom_price" ? "bg-white text-blue-800 shadow-sm" : "text-blue-300 hover:bg-white/10 hover:text-white"}`}>
                  Commission
                </button>
                <button onClick={async () => { await fetch("/api/agents/switch-type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: data.id, agentType: "custom_price", referralCode: data.referral_code }) }); setLocalAgentType("custom_price"); onRefresh(); }}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all ${effectiveType === "custom_price" ? "bg-white text-blue-800 shadow-sm" : "text-blue-300 hover:bg-white/10 hover:text-white"}`}>
                  Custom Price
                </button>
              </div>
            ) : effectiveType ? (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${effectiveType === "custom_price" ? "bg-purple-500/20 border border-purple-400/30" : "bg-green-500/20 border border-green-400/30"}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${effectiveType === "custom_price" ? "bg-purple-400" : "bg-green-400"}`} />
                <span className={`text-xs font-bold ${effectiveType === "custom_price" ? "text-purple-300" : "text-green-300"}`}>
                  {effectiveType === "custom_price" ? "Custom Price Mode" : "Commission Mode"}
                </span>
              </div>
            ) : (
              <button onClick={() => setTypeModalOpen(true)}
                className="w-full text-xs font-bold py-2 px-3 bg-yellow-500/20 border border-yellow-400/30 text-yellow-300 rounded-xl hover:bg-yellow-500/30 transition-all text-left">
                ⚠️ Choose your mode
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {(["dashboard", "buy", "orders", "link", "shop", ...(effectiveType === "custom_price" ? ["prices"] : [])] as NavPage[]).map(id => {
            const labels: Record<NavPage, string> = { dashboard: "Dashboard", buy: "Buy Data", orders: "My Orders", link: "Referral Link", prices: "My Prices", shop: "My Shop" };
            const active = page === id;
            return (
              <button key={id} onClick={() => { setPage(id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${active ? "bg-white/15 text-white" : "text-blue-300 hover:bg-white/10 hover:text-white"}`}>
                {id === "dashboard" && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                )}
                {id === "buy" && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
                {id === "orders" && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )}
                {id === "link" && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                )}
                {id === "shop" && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" points="9 22 9 12 15 12 15 22" />
                  </svg>
                )}
                {id === "prices" && (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                )}
                {labels[id]}
                {id === "orders" && data.orders.length > 0 && (
                  <span className="ml-auto bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{data.orders.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <a href={`https://wa.me/233509794503?text=${encodeURIComponent(`Hello Admin, I'm agent ${data.name} (${data.referral_code}). I need help.`)}`}
            target="_blank" rel="noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-300 hover:bg-white/10 hover:text-white transition-all">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
            </svg>
            WhatsApp Support
          </a>
          <button onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-300 hover:bg-red-500/20 hover:text-red-300 transition-all">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <p className="font-black text-gray-800 text-sm flex-1">Elite Data Agent Portal</p>
          <button onClick={onLogout}
            className="flex items-center gap-1.5 text-xs font-bold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 lg:p-6">

          {/* ── Dashboard page ── */}
          {page === "dashboard" && (
            <div className="space-y-5 max-w-4xl">
              <AnnouncementBanner target={data.agent_type === "custom_price" ? "agents_custom_price" : "agents_commission"} />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-gray-800">Dashboard</h2>
                  <p className="text-gray-400 text-sm">Welcome back, {data.name.split(" ")[0]}</p>
                </div>
                <button onClick={onRefresh} disabled={refreshing}
                  className="flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-300 text-gray-600 hover:text-blue-600 text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50">
                  <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>

              {/* Balance card */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">ELITE AGENT</span>
                    <span className="flex items-center gap-1 text-xs text-green-300 font-semibold">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" /> Active
                    </span>
                  </div>
                  <p className="text-blue-200 text-sm mb-1">Commission Balance</p>
                  <p className="text-4xl font-black mb-4">GH₵{(data.commission_balance ?? 0).toFixed(2)}</p>
                  <button onClick={() => setShowWithdraw(true)}
                    className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all border border-white/20">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Withdraw Funds
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Orders", value: String(data.total_sales ?? 0), color: "bg-blue-50", icon: "text-blue-600" },
                  { label: "Total Earned", value: `GH₵${totalEarned.toFixed(2)}`, color: "bg-green-50", icon: "text-green-600" },
                  { label: "Revenue", value: `GH₵${(data.total_revenue ?? 0).toFixed(2)}`, color: "bg-purple-50", icon: "text-purple-600" },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center mb-3`}>
                      <svg className={`w-5 h-5 ${s.icon}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-lg font-black text-gray-800 leading-none">{s.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Quick Actions</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button onClick={copyLink}
                    className="flex flex-col items-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-blue-700">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-bold">{copied ? "Copied!" : "Copy Link"}</span>
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Buy cheap data bundles! Use my link: ${referralLink}`)}`}
                    target="_blank" rel="noreferrer"
                    className="flex flex-col items-center gap-2 p-3 bg-green-50 hover:bg-green-100 rounded-xl transition-colors text-green-700">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
                    </svg>
                    <span className="text-xs font-bold">Share</span>
                  </a>
                  <button onClick={() => setPage("buy")}
                    className="flex flex-col items-center gap-2 p-3 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors text-purple-700">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="text-xs font-bold">Buy Data</span>
                  </button>
                  <button onClick={onRefresh} disabled={refreshing}
                    className="flex flex-col items-center gap-2 p-3 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors text-orange-700 disabled:opacity-50">
                    <svg className={`w-6 h-6 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-xs font-bold">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Recent transactions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Transactions</p>
                  {data.orders.length > 5 && (
                    <button onClick={() => setPage("orders")} className="text-xs text-blue-600 font-semibold hover:underline">View all</button>
                  )}
                </div>
                {data.orders.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">No transactions yet. Share your link to start earning!</p>
                ) : (
                  <div className="space-y-2">
                    {data.orders.slice(0, 8).map(o => (
                      <div key={o.reference} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${networkBadge(o.network)}`}>
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
          )}

          {/* ── Buy Data page ── */}
          {page === "buy" && <BuyDataPage agentCode={data.referral_code} />}

          {/* ── Orders page ── */}
          {page === "orders" && (
            <div className="max-w-5xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-gray-800">My Orders</h2>
                <button onClick={onRefresh} disabled={refreshing}
                  className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50">
                  <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {data.orders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                  <p className="text-gray-500 font-semibold mb-1">No orders yet</p>
                  <p className="text-gray-400 text-sm">Share your referral link to start earning commissions.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {["Bundle", "Phone", "Amount", "Commission", "Status", "Date"].map(h => (
                            <th key={h} className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((o, i) => (
                          <tr key={o.reference} className={`border-b border-gray-50 hover:bg-gray-50/50 ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${networkBadge(o.network)}`}>{o.network.toUpperCase()}</span>
                                <span className="font-semibold text-gray-800">{o.bundle_size}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-gray-600">{o.phone}</td>
                            <td className="px-5 py-3.5 font-semibold text-gray-800">GH₵{(o.amount ?? 0).toFixed(2)}</td>
                            <td className="px-5 py-3.5 font-bold text-green-600">+GH₵{(o.agent_commission ?? 0).toFixed(2)}</td>
                            <td className="px-5 py-3.5">
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusBadge(o.status)}`}>{o.status}</span>
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
          )}

          {/* ── Referral Link page ── */}
          {page === "link" && (
            <div className="max-w-2xl">
              <h2 className="text-xl font-black text-gray-800 mb-6">Your Referral Link</h2>
              <div className="space-y-4">
                {/* Link + copy */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <p className="text-sm font-semibold text-gray-600 mb-3">Your Link</p>
                  <div className="flex items-center gap-2 mb-3">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-700 break-all">{referralLink}</code>
                    <button onClick={copyLink}
                      className={`shrink-0 text-sm font-bold px-4 py-3 rounded-xl transition-colors text-white ${copied ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">Anyone who buys through this link earns you a commission automatically.</p>
                </div>

                {/* QR Code */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <p className="text-sm font-semibold text-gray-700 mb-1">QR Code</p>
                  <p className="text-xs text-gray-400 mb-5">Let customers scan this to open your buy link instantly — no typing needed.</p>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="p-4 border-2 border-blue-100 rounded-2xl bg-white shrink-0">
                      <QRCodeSVG
                        value={referralLink}
                        size={180}
                        bgColor="#ffffff"
                        fgColor="#1e3a5f"
                        level="M"
                        style={{ padding: 0 }}
                      />
                    </div>
                    <div className="space-y-3 text-center sm:text-left">
                      <div>
                        <p className="font-black text-2xl text-blue-700 font-mono">{data.referral_code}</p>
                        <p className="text-xs text-gray-400 mt-1">Your agent code</p>
                      </div>
                      <p className="text-sm text-gray-500">Print this QR code and place it anywhere — on your phone, a flyer, or a business card. Customers scan it and data is ordered instantly.</p>
                      <button
                        onClick={() => {
                          const svg = document.querySelector(".qr-download-area svg") as SVGElement | null;
                          if (!svg) return;
                          const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `elite-data-qr-${data.referral_code}.svg`;
                          a.click();
                        }}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download QR Code
                      </button>
                    </div>
                  </div>
                  {/* Hidden wrapper for download target */}
                  <div className="qr-download-area hidden">
                    <QRCodeSVG value={referralLink} size={400} bgColor="#ffffff" fgColor="#1e3a5f" level="M" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Your Code</p>
                    <p className="font-black text-3xl text-blue-700 font-mono">{data.referral_code}</p>
                    <p className="text-xs text-gray-400 mt-2">Customers can enter this code at checkout.</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Share via WhatsApp</p>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Buy cheap data bundles in Ghana! MTN, Telecel & AirtelTigo at the best prices. Use my link: ${referralLink}`)}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors">
                      Share on WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Shop page (all agents) ── */}
          {page === "shop" && <AgentShopPage agentId={data.id} referralCode={data.referral_code ?? ""} agentType={effectiveType} onSwitchToCustom={async () => {
            await fetch("/api/agents/switch-type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: data.id, agentType: "custom_price", referralCode: data.referral_code }) });
            setLocalAgentType("custom_price");
            onRefresh();
          }} />}

          {/* ── My Prices page (custom_price agents only) ── */}
          {page === "prices" && <AgentPricesPage agentId={data.id} referralCode={data.referral_code} />}

        </div>
      </main>
    </div>
    </>
  );
}

/* ─── Agent Shop Page (all agents) ─── */
function AgentShopPage({ agentId, referralCode, agentType, onSwitchToCustom }: {
  agentId: string;
  referralCode: string;
  agentType: "commission" | "custom_price" | null;
  onSwitchToCustom: () => void;
}) {
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const host = typeof window !== "undefined" ? window.location.origin : "https://elite-data1.vercel.app";
  const shopLink = `${host}/buy?agent=${referralCode}`;

  useEffect(() => {
    fetch(`/api/agents/shop?agentId=${agentId}`)
      .then(r => r.json())
      .then(d => { setShopName(d.shop_name ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentId]);

  function copyLink() {
    navigator.clipboard.writeText(shopLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <>
      {shopModalOpen && (
        <ShopSetupModal
          agentId={agentId}
          referralCode={referralCode}
          currentShopName={shopName}
          onSaved={(name) => { setShopName(name); }}
          onClose={() => setShopModalOpen(false)}
        />
      )}
      <div className="space-y-5 max-w-2xl">
        <div>
          <h2 className="text-xl font-black text-gray-800">My Shop</h2>
          <p className="text-gray-400 text-sm mt-1">Set up your branded storefront and set your own prices.</p>
        </div>

        {/* Shop name / link card */}
        {shopName ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-black text-gray-800 text-base">{shopName}</p>
                <p className="text-xs text-green-600 font-semibold mt-0.5">● Shop is live</p>
              </div>
              <button onClick={() => setShopModalOpen(true)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors">
                Edit Name
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-400 mb-1">Your Shop Link</p>
              <p className="font-mono text-xs text-gray-700 break-all">{shopLink}</p>
            </div>
            <button onClick={copyLink}
              className={`w-full text-sm font-bold py-2.5 rounded-xl transition-colors text-white ${linkCopied ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}>
              {linkCopied ? "✓ Copied!" : "Copy Shop Link"}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h3 className="font-black text-gray-800 text-lg mb-1">Create Your Shop</h3>
            <p className="text-gray-400 text-sm mb-5">Give your shop a name and get your own branded storefront link to share with customers.</p>
            <button onClick={() => setShopModalOpen(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
              Set Up My Shop
            </button>
          </div>
        )}

        {/* Prices section */}
        {agentType === "custom_price" ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-blue-800">Custom Prices Active</p>
              <p className="text-xs text-blue-600 mt-0.5">You set your own prices. Go to <span className="font-bold">My Prices</span> in the sidebar to edit them.</p>
            </div>
            <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="font-black text-gray-800 mb-1">Want to set your own prices?</p>
            <p className="text-sm text-gray-500 mb-4">Switch to Custom Price mode to set your own selling price for each bundle. You keep the difference as profit.</p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
              <p className="text-xs text-amber-700 font-semibold">⚠️ This change is permanent. Once you switch, you cannot go back to commission mode.</p>
            </div>
            <button onClick={onSwitchToCustom}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
              Switch to Custom Price Mode
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Agent Prices Page ─── */
function AgentPricesPage({ agentId, referralCode }: { agentId: string; referralCode: string }) {
  const [bundles, setBundles] = useState<{ id: string; network: string; size: string; sizeGB: number; price: number; costPrice: number }[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({});
  const [myPrices, setMyPrices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState<string | null>(null);
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const host = typeof window !== "undefined" ? window.location.origin : "https://elite-data1.vercel.app";
  const shopLink = `${host}/buy?agent=${referralCode}`;

  useEffect(() => {
    Promise.all([
      fetch("/api/bundles").then(r => r.json()),
      fetch("/api/agent-tier-prices").then(r => r.json()),
      fetch(`/api/agents/prices?agentId=${agentId}`).then(r => r.json()),
      fetch(`/api/agents/shop?agentId=${agentId}`).then(r => r.json()),
    ]).then(([b, t, p, s]) => {
      setBundles(b.bundles ?? []);
      const tm: Record<string, number> = {};
      for (const row of (t.prices ?? [])) tm[row.bundle_id] = row.price;
      setTierPrices(tm);
      const pm: Record<string, number> = {};
      for (const row of (p.prices ?? [])) pm[row.bundle_id] = row.custom_price;
      setMyPrices(pm);
      setShopName(s.shop_name ?? null);
      setLoading(false);
    });
  }, [agentId]);

  async function savePrice(bundleId: string, basePrice: number) {
    const val = myPrices[bundleId];
    if (!val) { setErrors(e => ({ ...e, [bundleId]: "Enter a price first." })); return; }
    if (val <= basePrice) { setErrors(e => ({ ...e, [bundleId]: `Must be above GH₵${basePrice.toFixed(2)}` })); return; }
    setErrors(e => ({ ...e, [bundleId]: "" }));
    setSaving(s => ({ ...s, [bundleId]: true }));
    const res = await fetch("/api/agents/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, bundleId, customPrice: val, referralCode }),
    });
    const d = await res.json();
    setSaving(s => ({ ...s, [bundleId]: false }));
    if (d.success) { setSaved(s => ({ ...s, [bundleId]: true })); setTimeout(() => setSaved(s => ({ ...s, [bundleId]: false })), 2000); }
    else setErrors(e => ({ ...e, [bundleId]: d.error ?? "Save failed." }));
  }

  const networks = ["mtn", "telecel", "airteltigo"];
  const networkLabels: Record<string, string> = { mtn: "MTN", telecel: "Telecel", airteltigo: "AirtelTigo" };
  const networkColors: Record<string, string> = { mtn: "bg-yellow-400 text-yellow-900", telecel: "bg-red-500 text-white", airteltigo: "bg-blue-500 text-white" };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <>
    {shopModalOpen && (
      <ShopSetupModal
        agentId={agentId}
        referralCode={referralCode}
        currentShopName={shopName}
        onSaved={(name) => { setShopName(name); }}
        onClose={() => setShopModalOpen(false)}
      />
    )}
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-black text-gray-800">My Prices</h2>
        <p className="text-gray-400 text-sm mt-1">Set your selling price above the base. Customers on your link <span className="font-mono text-blue-600">{referralCode}</span> see YOUR price.</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
        <span className="font-bold">Your profit</span> = your price − base price. Set it as high as you want — the difference is yours.
      </div>
      {networks.map(net => {
        const netBundles = bundles.filter(b => b.network === net).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
        if (!netBundles.length) return null;
        return (
          <div key={net} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`px-4 py-3 flex items-center gap-2 ${networkColors[net]}`}>
              <span className="font-black text-sm">{networkLabels[net]} Bundles</span>
            </div>
            <div className="divide-y divide-gray-50">
              {netBundles.map(b => {
                const basePrice = tierPrices[b.id] ?? b.price;
                const myVal = myPrices[b.id];
                const profit = myVal ? Math.max(0, myVal - basePrice) : null;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{b.size}</p>
                      <p className="text-xs text-gray-400">
                        Base: GH₵{basePrice.toFixed(2)}
                        {profit !== null && profit > 0 && (
                          <span className="text-green-600 font-semibold ml-2">· Your profit: GH₵{profit.toFixed(2)}</span>
                        )}
                      </p>
                      {errors[b.id] && <p className="text-xs text-red-500 mt-0.5">{errors[b.id]}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">GH₵</span>
                        <input
                          type="number" step="0.5" min={basePrice + 0.5}
                          value={myPrices[b.id] ?? ""}
                          onChange={e => setMyPrices(m => ({ ...m, [b.id]: parseFloat(e.target.value) }))}
                          placeholder={(basePrice + 1).toFixed(2)}
                          className="w-24 pl-9 pr-2 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
                        />
                      </div>
                      <button onClick={() => savePrice(b.id, basePrice)} disabled={saving[b.id]}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${saved[b.id] ? "bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"}`}>
                        {saving[b.id] ? "…" : saved[b.id] ? "✓" : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Your Shop section ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <p className="font-black text-gray-800 text-sm">Your Branded Storefront</p>
          <p className="text-xs text-gray-400 mt-0.5">Give your shop a name and your customers will see a completely different, branded website.</p>
        </div>

        {shopName ? (
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg shrink-0"
                style={{ background: `linear-gradient(135deg, ${shopPaletteFor(shopName).from}, ${shopPaletteFor(shopName).to})` }}>
                {shopName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm">{shopName}</p>
                <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" /> Shop is live
                </p>
              </div>
              <button onClick={() => setShopModalOpen(true)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-xl transition-colors shrink-0">
                Edit Name
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
              <code className="flex-1 text-xs text-gray-600 break-all font-mono">{shopLink}</code>
              <button onClick={() => { navigator.clipboard.writeText(shopLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors text-white ${linkCopied ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}>
                {linkCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="font-bold text-gray-800 text-sm mb-1">Create Your Shop</p>
            <p className="text-xs text-gray-400 mb-4">Enter a brand name and get a custom-colored storefront your customers will see as YOUR website.</p>
            <button onClick={() => setShopModalOpen(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Your Shop
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/* ─── Shop Setup Modal ─── */
const SHOP_PALETTES = [
  { from: "#0ea5e9", to: "#2563eb", bg: "#f0f9ff", btn: "#0284c7" },
  { from: "#f97316", to: "#dc2626", bg: "#fff7ed", btn: "#ea580c" },
  { from: "#16a34a", to: "#059669", bg: "#f0fdf4", btn: "#15803d" },
  { from: "#7c3aed", to: "#4f46e5", bg: "#f5f3ff", btn: "#6d28d9" },
  { from: "#db2777", to: "#e11d48", bg: "#fff1f2", btn: "#be185d" },
  { from: "#d97706", to: "#b45309", bg: "#fffbeb", btn: "#b45309" },
  { from: "#0d9488", to: "#0891b2", bg: "#f0fdfa", btn: "#0f766e" },
  { from: "#6d28d9", to: "#1d4ed8", bg: "#faf5ff", btn: "#5b21b6" },
];
function shopPaletteFor(name: string) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SHOP_PALETTES[hash % SHOP_PALETTES.length];
}

function ShopSetupModal({ agentId, referralCode, currentShopName, onSaved, onClose }: {
  agentId: string;
  referralCode: string;
  currentShopName: string | null;
  onSaved: (name: string) => void;
  onClose: () => void;
}) {
  const [shopName, setShopName] = useState(currentShopName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const trimmed = shopName.trim();
  const palette = trimmed.length >= 2 ? shopPaletteFor(trimmed) : null;
  const host = typeof window !== "undefined" ? window.location.origin : "https://elite-data1.vercel.app";
  const shopLink = `${host}/buy?agent=${referralCode}`;

  async function handleSave() {
    if (!trimmed) { setError("Enter your shop name."); return; }
    if (trimmed.length < 3) { setError("Shop name must be at least 3 characters."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/agents/shop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, shopName: trimmed, referralCode }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) { setSaved(true); onSaved(trimmed); }
    else setError(d.error ?? "Save failed. Try again.");
  }

  function copyLink() {
    navigator.clipboard.writeText(shopLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const gradStyle = palette ? { background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` } : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh] p-6">
        {saved ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={gradStyle}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-black text-gray-800 text-xl mb-1">Shop Created!</h3>
            <p className="text-gray-500 text-sm mb-5">Your branded storefront is live. Share this link with your customers.</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2">
              <p className="text-xs text-gray-400 mb-1">Your Shop Link</p>
              <p className="font-mono text-xs text-gray-700 break-all">{shopLink}</p>
            </div>
            <button onClick={copyLink}
              className={`w-full text-sm font-bold py-2.5 rounded-xl mb-3 transition-colors text-white ${copied ? "bg-green-500" : "bg-blue-600 hover:bg-blue-700"}`}>
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button onClick={onClose} className="w-full text-gray-400 hover:text-gray-600 text-sm py-1 transition-colors">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-gray-800 text-lg">Create Your Shop</h3>
                <p className="text-xs text-gray-400">Your customers see this as their store.</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Shop / Brand Name *</label>
                <input type="text" value={shopName}
                  onChange={e => { setShopName(e.target.value); setError(""); }}
                  placeholder="e.g. Kofi Data Hub, Ama's Bundles"
                  maxLength={40}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              </div>

              {palette && trimmed.length >= 2 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Your Brand Colors (auto-generated)</p>
                  <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                    <div className="p-4 text-white" style={gradStyle}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-black text-lg">
                          {trimmed.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-sm leading-none">{trimmed}</p>
                          <p className="text-xs text-white/70 mt-0.5">Data Bundles · Fast Delivery</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3" style={{ background: palette.bg }}>
                      <div className="grid grid-cols-3 gap-2">
                        {["MTN 1GB", "MTN 2GB", "MTN 5GB"].map(s => (
                          <div key={s} className="bg-white rounded-xl p-2 text-center shadow-sm">
                            <p className="text-xs font-bold text-gray-700">{s}</p>
                            <div className="mt-1.5 py-1 rounded-lg text-xs font-bold text-white" style={gradStyle}>Buy</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
                <p className="font-bold">What your customers will see:</p>
                <p>✓ Your shop name as the brand</p>
                <p>✓ Your custom prices</p>
                <p>✓ Your WhatsApp contact</p>
                <p>✓ A completely different look from Elite Data</p>
              </div>

              <button onClick={handleSave} disabled={saving || trimmed.length < 3}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
                {saving ? "Creating Shop…" : currentShopName ? "Save Changes" : "Create My Shop"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Agent Type Modal (one-time permanent choice) ─── */
function AgentTypeModal({ agentId, referralCode, onChosen }: { agentId: string; referralCode: string; onChosen: (type: "commission" | "custom_price") => void }) {
  const [selected, setSelected] = useState<"commission" | "custom_price" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agents/switch-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, agentType: selected, referralCode }),
      });
      const d = await res.json();
      if (d.success) onChosen(selected);
      else setError(d.error ?? "Failed. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-y-auto max-h-[90vh]">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-gray-900">Choose Your Agent Mode</h2>
          <p className="text-gray-500 text-sm mt-1">This is a <span className="font-bold text-red-500">permanent choice</span>. You cannot change it later.</p>
        </div>

        <div className="space-y-3 mb-5">
          <button type="button" onClick={() => setSelected("commission")}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${selected === "commission" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === "commission" ? "border-blue-500" : "border-gray-300"}`}>
                {selected === "commission" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
              </div>
              <div>
                <p className="font-black text-gray-800 text-sm">Commission Mode (80/20)</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Customers see <strong>Elite Data&apos;s prices</strong>. When someone buys through your link, you earn <strong className="text-green-600">80% of the profit</strong> automatically. Just share your link and earn.
                </p>
                <p className="text-xs text-blue-600 font-semibold mt-2">E.g. MTN 2GB at GH₵12 → you earn GH₵3.60</p>
              </div>
            </div>
          </button>

          <button type="button" onClick={() => setSelected("custom_price")}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${selected === "custom_price" ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-purple-300"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === "custom_price" ? "border-purple-500" : "border-gray-300"}`}>
                {selected === "custom_price" && <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
              </div>
              <div>
                <p className="font-black text-gray-800 text-sm">Custom Price Mode</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  You set <strong>your own selling price</strong> for each bundle above the base cost. Customers on your link see YOUR prices. You keep <strong className="text-purple-600">100% of your markup</strong>.
                </p>
                <p className="text-xs text-purple-600 font-semibold mt-2">E.g. Base GH₵8.50 → you sell at GH₵12 → you keep GH₵3.50</p>
              </div>
            </div>
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg mb-4">{error}</div>}

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-amber-700 font-bold">⚠️ This decision is permanent.</p>
          <p className="text-xs text-amber-600 mt-1">Once you confirm, your mode is locked forever. Think carefully before choosing.</p>
        </div>

        <button onClick={confirm} disabled={!selected || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-sm transition-colors">
          {loading ? "Confirming…" : selected ? `Confirm — ${selected === "commission" ? "Commission Mode" : "Custom Price Mode"}` : "Select a mode above to continue"}
        </button>
      </div>
    </div>
  );
}

/* ─── Buy Data Page (agent places orders inside dashboard) ─── */
function BuyDataPage({ agentCode }: { agentCode: string }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [network, setNetwork] = useState<"all" | "mtn" | "telecel" | "airteltigo">("all");
  const [selected, setSelected] = useState<Bundle | null>(null);

  useEffect(() => {
    fetch(`/api/bundles?agent=${agentCode}`)
      .then(r => r.json())
      .then(d => { setBundles(d.bundles ?? []); setLoading(false); });
  }, [agentCode]);

  const filtered = network === "all" ? bundles : bundles.filter(b => b.network === network);

  function networkColor(n: string) {
    if (n === "mtn") return "bg-yellow-400 text-yellow-900";
    if (n === "telecel") return "bg-red-500 text-white";
    return "bg-blue-500 text-white";
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <>
      {selected && <CheckoutModal bundle={selected} agentCode={agentCode} onClose={() => setSelected(null)} />}
      <div className="max-w-4xl space-y-5">
        <div>
          <h2 className="text-xl font-black text-gray-800">Buy Data</h2>
          <p className="text-gray-400 text-sm mt-1">Place an order for a customer. Your referral code is attached automatically.</p>
        </div>

        {/* Network filter */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "mtn", "telecel", "airteltigo"] as const).map(n => (
            <button key={n} onClick={() => setNetwork(n)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all capitalize ${network === n ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"}`}>
              {n === "all" ? "All Networks" : n === "airteltigo" ? "AirtelTigo" : n.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Bundle grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(b => (
            <button key={b.id} onClick={() => setSelected(b)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-blue-300 hover:shadow-md transition-all group">
              <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black mb-3 ${networkColor(b.network)}`}>
                {b.network === "airteltigo" ? "AirtelTigo" : b.network.toUpperCase()}
              </div>
              <p className="font-black text-gray-800 text-lg leading-none mb-1">{b.size}</p>
              <p className="text-blue-600 font-black text-xl">GH₵{b.price.toFixed(2)}</p>
              <div className="mt-3 w-full bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-xl transition-colors text-center">
                Buy Now
              </div>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 font-semibold">No bundles available for this network.</div>
        )}
      </div>
    </>
  );
}

/* ─── Page shell ─── */
function DashboardContent() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const [data, setData] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  function fetchAgent(param: string, isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    fetch(`/api/agents/dashboard?${param}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.agent);
        else if (!isRefresh) setLoginError(json.error || "Not found.");
      })
      .catch(() => { if (!isRefresh) setLoginError("Network error."); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }

  useEffect(() => {
    if (code) fetchAgent(`code=${encodeURIComponent(code.toUpperCase())}`);
  }, [code]);

  function handleRefresh() {
    if (data) fetchAgent(`code=${encodeURIComponent(data.referral_code)}`, true);
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (loginError) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-800 font-semibold mb-3">{loginError}</p>
          <button onClick={() => setLoginError("")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <LoginForm onLogin={setData} />;

  return <Dashboard data={data} onLogout={() => setData(null)} onRefresh={handleRefresh} refreshing={refreshing} />;
}

export default function AgentDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
