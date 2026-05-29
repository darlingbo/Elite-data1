"use client";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import AnnouncementBanner from "@/components/AnnouncementBanner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Order {
  reference: string; bundle_size: string; network: string;
  amount: number; cost_price?: number; agent_commission?: number;
  status: string; created_at: string; phone: string;
}
interface ManualOrder {
  id: string; customer_phone: string; network: string; bundle_size: string;
  amount_paid: number; cost_price: number; agent_commission: number;
  status: string; created_at: string; notes?: string;
}
interface AgentData {
  id: string; name: string; email: string; phone?: string | null; referral_code: string;
  wallet_balance: number; commission_balance: number; pending_commission?: number;
  total_sales: number; total_revenue: number;
  agent_type: "commission" | "custom_price" | null;
  business_name?: string | null;
  orders: Order[];
}
interface WalletTx {
  id: string; type: string; amount: number; description: string; created_at: string;
}
type Page = "dashboard" | "orders" | "customers" | "wallet" | "transactions" | "referrals" | "leaderboard" | "profile" | "settings" | "prices" | "place_order" | "api";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const SB = { bg: "#0d1b2e", border: "#1e3a5f", text: "#f8fafc", muted: "#94a3b8" };
const M = { bg: "#f1f5f9", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", sub: "#94a3b8", blue: "#3b82f6", purple: "#7c3aed", green: "#16a34a", red: "#ef4444", amber: "#f59e0b" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : h < 21 ? "Good Evening" : "Good Night";
}

function getAgentTier(rev: number) {
  const tiers = [
    { name: "Bronze", next: "Silver", lo: 0,    hi: 1000,  color: "#b45309", bg: "#fef3c7", icon: "🥉", benefits: ["Standard access", "Commission on all sales", "WhatsApp support"] },
    { name: "Silver", next: "Gold",   lo: 1000,  hi: 5000,  color: "#64748b", bg: "#f1f5f9", icon: "🥈", benefits: ["12% Commission Rate", "Higher withdrawal limit", "Priority support"] },
    { name: "Gold",   next: "Platinum", lo: 5000, hi: 20000, color: "#d97706", bg: "#fffbeb", icon: "🥇", benefits: ["15% Commission Rate", "VIP withdrawal limit", "Dedicated support", "Early bundle access"] },
    { name: "Platinum", next: null, lo: 20000, hi: Infinity, color: "#7c3aed", bg: "#f5f3ff", icon: "💎", benefits: ["18% Commission Rate", "Unlimited withdrawals", "Account manager", "Custom pricing"] },
  ];
  const t = tiers.find(t => rev >= t.lo && rev < t.hi) ?? tiers[3];
  const pct = t.hi === Infinity ? 100 : Math.min(((rev - t.lo) / (t.hi - t.lo)) * 100, 100);
  const remaining = t.hi === Infinity ? 0 : t.hi - rev;
  return { ...t, pct, remaining };
}

function getTopCustomers(orders: Order[]) {
  const map: Record<string, { masked: string; count: number; total: number }> = {};
  for (const o of orders.filter(o => o.status.toLowerCase() === "completed")) {
    const k = o.phone ?? "";
    if (!k) continue;
    const masked = k.slice(0, 3) + " **** " + k.slice(-3);
    if (!map[k]) map[k] = { masked, count: 0, total: 0 };
    map[k].count++; map[k].total += Number(o.amount);
  }
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
}

function getDailySales(orders: Order[], days = 30) {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now); d.setDate(now.getDate() - (days - 1 - i)); d.setHours(0, 0, 0, 0);
    const nxt = new Date(d); nxt.setDate(d.getDate() + 1);
    const dayO = orders.filter(o => { const t = new Date(o.created_at); return t >= d && t < nxt && o.status.toLowerCase() === "completed"; });
    const showLabel = i === 0 || i === days - 1 || i % 5 === 0;
    const label = showLabel ? `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}` : "";
    return { label, revenue: dayO.reduce((s, o) => s + Number(o.amount), 0), count: dayO.length };
  });
}

function pctChange(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100 * 10) / 10;
}

function getMonthStats(orders: Order[]) {
  const now = new Date();
  const ym = (d: Date) => d.getFullYear() * 100 + d.getMonth();
  const curr = orders.filter(o => ym(new Date(o.created_at)) === ym(now));
  const prev = orders.filter(o => {
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return ym(new Date(o.created_at)) === ym(pm);
  });
  const rev = (arr: Order[]) => arr.filter(o => o.status.toLowerCase() === "completed").reduce((s, o) => s + Number(o.amount), 0);
  const comp = (arr: Order[]) => arr.filter(o => o.status.toLowerCase() === "completed").length;
  const uniquePhones = (arr: Order[]) => new Set(arr.map(o => o.phone).filter(Boolean)).size;
  const spent = (arr: Order[]) => arr.reduce((s, o) => s + Number(o.cost_price ?? 0), 0);
  return {
    count: curr.length, revenue: rev(curr), completed: comp(curr),
    customers: uniquePhones(curr), spent: spent(curr),
    revPct: pctChange(rev(curr), rev(prev)),
    cntPct: pctChange(curr.length, prev.length),
    compPct: pctChange(comp(curr), comp(prev)),
    custPct: pctChange(uniquePhones(curr), uniquePhones(prev)),
    spentPct: pctChange(spent(curr), spent(prev)),
  };
}

function netBadge(network: string) {
  const n = (network ?? "").toLowerCase();
  if (n === "mtn") return { bg: "#fef3c7", color: "#b45309", label: "MTN" };
  if (n === "telecel") return { bg: "#fee2e2", color: "#dc2626", label: "Telecel" };
  if (n.includes("airtel")) return { bg: "#ede9fe", color: "#7c3aed", label: "AirtelTigo" };
  return { bg: "#f1f5f9", color: "#64748b", label: (network ?? "—").toUpperCase().slice(0, 3) };
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") return { bg: "#dcfce7", color: "#16a34a", label: "Completed" };
  if (s === "processing") return { bg: "#dbeafe", color: "#2563eb", label: "Processing" };
  if (s === "pending") return { bg: "#fef9c3", color: "#ca8a04", label: "Pending" };
  return { bg: "#fee2e2", color: "#dc2626", label: "Failed" };
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────
function SalesChart({ data }: { data: { label: string; revenue: number }[] }) {
  const W = 500, H = 130, pad = { t: 8, r: 4, b: 28, l: 4 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const pts = data.map((d, i) => ({ x: pad.l + (i / Math.max(data.length - 1, 1)) * iW, y: pad.t + iH - (d.revenue / max) * iH }));
  const line = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const pr = pts[i - 1], cx = (pr.x + p.x) / 2;
    return `${acc} C${cx} ${pr.y} ${cx} ${p.y} ${p.x} ${p.y}`;
  }, "");
  const area = `${line} L${pts[pts.length - 1].x} ${H - pad.b} L${pts[0].x} ${H - pad.b}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 160 }}>
      <defs>
        <linearGradient id="agGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t, i) => <line key={i} x1={pad.l} y1={pad.t + iH * (1 - t)} x2={W - pad.r} y2={pad.t + iH * (1 - t)} stroke="#e2e8f0" strokeWidth={0.8} />)}
      <path d={area} fill="url(#agGrad)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth={2.5} strokeLinecap="round" />
      {pts.map((p, i) => data[i].revenue > 0 && <circle key={i} cx={p.x} cy={p.y} r={3} fill="#7c3aed" stroke="white" strokeWidth={1.5} />)}
      {data.map((d, i) => d.label && <text key={i} x={pts[i].x} y={H - pad.b + 14} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize={8} fill="#94a3b8">{d.label}</text>)}
    </svg>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (d: AgentData) => void }) {
  const [tab, setTab] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");

  async function handleLogin() {
    setError(""); setLoading(true);
    try {
      let res: Response;
      if (tab === "code") {
        if (!code.trim()) { setError("Enter your referral code."); setLoading(false); return; }
        res = await fetch(`/api/agents/dashboard?code=${encodeURIComponent(code.trim().toUpperCase())}`);
      } else {
        if (!email.trim() || !password) { setError("Enter email and password."); setLoading(false); return; }
        res = await fetch("/api/agents/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
      }
      const j = await res.json();
      if (j.success) onLogin(j.agent);
      else setError(j.error || "Login failed. Check your details.");
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  }

  const inp: React.CSSProperties = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", color: "#0f172a", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0d1b2e,#1e1b4b)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 22, fontWeight: 900, color: "white" }}>E</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", margin: "0 0 6px" }}>Elite Data Agent</h1>
          <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Sign in to your agent dashboard</p>
        </div>
        <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 12, padding: 4, marginBottom: 22, gap: 4 }}>
            {(["email", "code"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: tab === t ? "linear-gradient(90deg,#3b82f6,#7c3aed)" : "transparent", color: tab === t ? "white" : "#64748b" }}>
                {t === "email" ? "Email & Password" : "Referral Code"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {tab === "email" ? (
              <>
                <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Email</label><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
                <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Password</label><input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
              </>
            ) : (
              <div><label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Referral Code</label><input style={inp} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. STEP0001" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
            )}
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: 0, background: "#fee2e2", padding: "10px 12px", borderRadius: 10 }}>{error}</p>}
            <button onClick={handleLogin} disabled={loading} style={{ background: loading ? "#94a3b8" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </div>
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 20 }}>Not an agent yet? <a href="/agent" style={{ color: "#60a5fa", fontWeight: 600 }}>Apply here →</a></p>
      </div>
    </div>
  );
}

// ─── Add Funds Modal ──────────────────────────────────────────────────────────
function AddFundsModal({ agentId, agentEmail, onClose, onSuccess }: { agentId: string; agentEmail: string; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("100"); const [loading, setLoading] = useState(false); const [error, setError] = useState("");

  function handlePay() {
    const amt = Number(amount);
    if (!amt || amt < 10) { setError("Minimum deposit is GH₵10."); return; }

    const ps = (window as unknown as { PaystackPop?: { setup: (opts: Record<string, unknown>) => { openIframe: () => void } } }).PaystackPop;
    if (!ps) { setError("Payment gateway not ready. Please wait a moment and try again."); return; }

    setLoading(true); setError("");
    try {
      const handler = ps.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email: agentEmail,
        amount: Math.round(amt * 100),
        currency: "GHS",
        callback: async (response: { reference: string }) => {
          try {
            const res = await fetch("/api/agents/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, paystackRef: response.reference }) });
            const d = await res.json();
            if (d.success) { onSuccess(); onClose(); } else { setError(d.error ?? "Top-up failed."); setLoading(false); }
          } catch { setError("Network error. Your payment went through — contact support with your reference."); setLoading(false); }
        },
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) {
      setError(`Could not open payment: ${String(err)}`);
      setLoading(false);
    }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div><h3 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Top Up Wallet</h3><p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Add funds to your working capital</p></div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 10, color: M.muted, cursor: "pointer", width: 32, height: 32, fontSize: 16 }}>✕</button>
        </div>
        <p style={{ color: M.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Amount (GH₵)</p>
        <input type="number" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 16px", color: M.text, fontSize: 22, fontWeight: 800, width: "100%", outline: "none", boxSizing: "border-box", textAlign: "center" }} value={amount} onChange={e => setAmount(e.target.value)} min={10} step={10} />
        <div style={{ display: "flex", gap: 8, margin: "14px 0 20px" }}>
          {[50, 100, 200, 500].map(v => <button key={v} onClick={() => setAmount(String(v))} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: `2px solid ${amount === String(v) ? M.blue : M.border}`, background: amount === String(v) ? "#eff6ff" : "white", color: amount === String(v) ? M.blue : M.muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{v}</button>)}
        </div>
        {error && <p style={{ color: M.red, fontSize: 13, marginBottom: 14, background: "#fee2e2", padding: "10px 12px", borderRadius: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${M.border}`, background: "white", color: M.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={handlePay} disabled={loading} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", fontSize: 14, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Processing…" : `Pay GH₵${Number(amount) || 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Withdraw Modal ───────────────────────────────────────────────────────────
function WithdrawModal({ agentId, referralCode, profitBalance, onClose, onSuccess }: { agentId: string; referralCode: string; profitBalance: number; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState(String(Math.min(profitBalance, 200)));
  const [method, setMethod] = useState("MTN MoMo"); const [phone, setPhone] = useState(""); const [name, setName] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);

  async function handleWithdraw() {
    const amt = Number(amount);
    if (!amt || amt < 50) { setError("Minimum withdrawal is GH₵50."); return; }
    if (amt > profitBalance) { setError(`You only have GH₵${profitBalance.toFixed(2)} available.`); return; }
    if (!phone || !name) { setError("Enter your account details."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/agents/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, referralCode, name, amount: amt, method, accountNumber: phone, accountName: name }) });
      const d = await res.json();
      if (d.success) { setDone(true); onSuccess(); } else setError(d.error ?? "Withdrawal failed.");
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  }

  const inp: React.CSSProperties = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", color: M.text, fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div><h3 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Withdraw Earnings</h3><p style={{ color: "#16a34a", fontSize: 13, margin: "4px 0 0", fontWeight: 700 }}>Available: GH₵{profitBalance.toFixed(2)}</p></div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 10, color: M.muted, cursor: "pointer", width: 32, height: 32, fontSize: 16 }}>✕</button>
        </div>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ color: M.text, fontWeight: 800, fontSize: 16, margin: "0 0 8px" }}>Withdrawal sent!</p>
            <p style={{ color: M.muted, fontSize: 13, margin: "0 0 20px" }}>Your earnings are on the way to {phone}.</p>
            <button onClick={onClose} style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Close</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[["Amount (GH₵)", amount, (v: string) => setAmount(v), "number", "50", String(profitBalance)],
              ["Mobile Money", method, (v: string) => setMethod(v), "select", "", ""],
              ["Mobile Number", phone, (v: string) => setPhone(v), "tel", "0241234567", ""],
              ["Account Name", name, (v: string) => setName(v), "text", "Full name on MoMo", ""]
            ].map(([label, val, set, type, placeholder]) => (
              <div key={label as string}>
                <label style={{ fontSize: 12, fontWeight: 700, color: M.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>{label as string}</label>
                {type === "select" ? (
                  <select style={inp} value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)}><option>MTN MoMo</option><option>Telecel Cash</option><option>AirtelTigo</option></select>
                ) : (
                  <input style={inp} type={type as string} value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)} placeholder={placeholder as string} />
                )}
              </div>
            ))}
            {error && <p style={{ color: M.red, fontSize: 13, margin: 0, background: "#fee2e2", padding: "10px 12px", borderRadius: 10 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${M.border}`, background: "white", color: M.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleWithdraw} disabled={loading} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(90deg,#16a34a,#15803d)", color: "white", fontSize: 14, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
                {loading ? "Sending…" : "Withdraw"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
function DashboardPage({ data, onAddFunds, onWithdraw, onNavigate }: { data: AgentData; onAddFunds: () => void; onWithdraw: () => void; onNavigate: (p: Page) => void }) {
  const isPriceMode = data.agent_type === "custom_price";
  const ms = useMemo(() => getMonthStats(data.orders), [data.orders]);
  const daily = useMemo(() => getDailySales(data.orders, 30), [data.orders]);
  const topCustomers = useMemo(() => getTopCustomers(data.orders), [data.orders]);
  const tier = useMemo(() => getAgentTier(data.total_revenue ?? 0), [data.total_revenue]);
  const completed = data.orders.filter(o => o.status.toLowerCase() === "completed");
  const successRate = data.orders.length > 0 ? Math.round((completed.length / data.orders.length) * 100 * 10) / 10 : 0;
  const uniqueCustomers = new Set(data.orders.map(o => o.phone).filter(Boolean)).size;
  const totalSpent = data.orders.reduce((s, o) => s + Number(o.cost_price ?? 0), 0);
  const dailyAvg = daily.filter(d => d.count > 0).reduce((s, d) => s + d.revenue, 0) / Math.max(daily.filter(d => d.count > 0).length, 1);
  const bestDay = daily.reduce((best, d) => d.revenue > best.revenue ? d : best, daily[0] ?? { label: "—", revenue: 0 });

  function PctBadge({ val, invert }: { val: number; invert?: boolean }) {
    const up = invert ? val <= 0 : val >= 0;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color: up ? "#16a34a" : "#dc2626", background: up ? "#dcfce7" : "#fee2e2", padding: "2px 6px", borderRadius: 20 }}>
        {up ? "↑" : "↓"} {Math.abs(val).toFixed(1)}%
      </span>
    );
  }

  const statCards = [
    { label: "Wallet Balance", value: `GH₵${(data.wallet_balance ?? 0).toFixed(2)}`, sub: <button onClick={onAddFunds} style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", marginTop: 6 }}>Top Up Wallet</button>, icon: "💳", iconBg: "#eff6ff", pct: null },
    { label: "Total Spent", value: `GH₵${totalSpent.toFixed(2)}`, sub: <span style={{ fontSize: 11, color: M.muted }}>This Month: GH₵{ms.spent.toFixed(2)}</span>, icon: "🛒", iconBg: "#fff7ed", pct: ms.spentPct },
    { label: "Total Orders", value: String(data.total_sales ?? data.orders.length), sub: <span style={{ fontSize: 11, color: M.muted }}>This Month: {ms.count}</span>, icon: "📦", iconBg: "#f0fdf4", pct: ms.cntPct },
    { label: "Successful Orders", value: String(completed.length), sub: <span style={{ fontSize: 11, color: M.muted }}>{successRate}% Success Rate</span>, icon: "✅", iconBg: "#f0fdf4", pct: ms.compPct },
    { label: "Total Customers", value: String(uniqueCustomers), sub: <span style={{ fontSize: 11, color: M.muted }}>This Month: {ms.customers}</span>, icon: "👥", iconBg: "#faf5ff", pct: ms.custPct },
    { label: "Total Earnings", value: `GH₵${(data.commission_balance ?? 0).toFixed(2)}`, sub: <span style={{ fontSize: 11, color: M.muted }}>This Month: GH₵{ms.revenue.toFixed(2)}</span>, icon: "💰", iconBg: "#fffbeb", pct: ms.revPct },
  ];

  const card = (children: React.ReactNode, style: React.CSSProperties = {}) => (
    <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, ...style }}>{children}</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AnnouncementBanner target={isPriceMode ? "agents_custom_price" : "agents_commission"} />

      {/* 6 Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14 }} className="stat-grid">
        {statCards.map((c, i) => (
          <div key={i} style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -16, right: -16, width: 80, height: 80, borderRadius: "50%", background: c.iconBg, opacity: 0.8 }} />
            <div style={{ width: 40, height: 40, borderRadius: 12, background: c.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 12 }}>{c.icon}</div>
            <p style={{ fontSize: 11, color: M.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 6px" }}>{c.label}</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: M.text, margin: "0 0 4px", lineHeight: 1.1 }}>{c.value}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {c.pct !== null && <PctBadge val={c.pct ?? 0} />}
              <span style={{ fontSize: 11, color: M.sub }}>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main 2-col: Left = table + chart, Right = wallet summary + commission */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }} className="main-grid">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Recent Orders */}
          {card(
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Recent Orders</p>
                <button onClick={() => onNavigate("orders")} style={{ background: "none", border: "none", color: M.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View All</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Order ID", "Network", "Plan", "Phone Number", "Amount", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: M.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap", borderBottom: `1px solid ${M.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.slice(0, 8).map((o, i) => {
                      const nb = netBadge(o.network); const sb = statusBadge(o.status);
                      const shortRef = `#${(o.reference ?? "").replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase()}`;
                      const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel|vodafone)\s+/i, "").trim();
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${M.border}` }}>
                          <td style={{ padding: "12px 16px", color: M.blue, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{shortRef}</td>
                          <td style={{ padding: "12px 16px" }}><span style={{ background: nb.bg, color: nb.color, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{nb.label}</span></td>
                          <td style={{ padding: "12px 16px", color: M.text, fontWeight: 600 }}>{cleanSize}</td>
                          <td style={{ padding: "12px 16px", color: M.muted, fontFamily: "monospace", fontSize: 12 }}>{(o.phone ?? "").slice(0, 3) + " **** " + (o.phone ?? "").slice(-3)}</td>
                          <td style={{ padding: "12px 16px", color: M.text, fontWeight: 800 }}>GH₵{Number(o.amount).toFixed(2)}</td>
                          <td style={{ padding: "12px 16px" }}><span style={{ background: sb.bg, color: sb.color, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{sb.label}</span></td>
                        </tr>
                      );
                    })}
                    {data.orders.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: M.muted }}>No orders yet. Share your store link to get your first sale!</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Sales Overview */}
          {card(
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Sales Overview</p>
                <span style={{ fontSize: 12, color: M.muted, border: `1px solid ${M.border}`, borderRadius: 8, padding: "4px 10px" }}>Last 30 Days</span>
              </div>
              <div style={{ padding: "16px 20px 0" }}>
                <SalesChart data={daily} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderTop: `1px solid ${M.border}` }}>
                {[
                  { label: "Daily Average", value: `GH₵${dailyAvg.toFixed(2)}` },
                  { label: "Best Day", value: bestDay.label || "—", sub: bestDay.revenue > 0 ? `GH₵${bestDay.revenue.toFixed(2)}` : "" },
                  { label: "Total Sales", value: `GH₵${ms.revenue.toFixed(2)}` },
                  { label: "Profit (Est.)", value: `GH₵${(ms.revenue - ms.spent).toFixed(2)}` },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "12px 16px", borderRight: i < 3 ? `1px solid ${M.border}` : "none" }}>
                    <p style={{ fontSize: 11, color: M.muted, margin: "0 0 4px", fontWeight: 600 }}>{s.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 900, color: M.text, margin: 0 }}>{s.value}</p>
                    {s.sub && <p style={{ fontSize: 11, color: "#16a34a", margin: "2px 0 0", fontWeight: 700 }}>{s.sub}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Wallet Summary */}
          {card(
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Wallet Summary</p>
                <button onClick={() => onNavigate("wallet")} style={{ background: "none", border: "none", color: M.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View All</button>
              </div>
              <div style={{ padding: "20px" }}>
                <p style={{ fontSize: 12, color: M.muted, fontWeight: 600, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.6 }}>Available Balance</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: "#16a34a", margin: "0 0 16px", lineHeight: 1 }}>GH₵{(data.wallet_balance ?? 0).toFixed(2)}</p>
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                  <button onClick={onAddFunds} style={{ flex: 1, background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Top Up</button>
                  <button onClick={onWithdraw} style={{ flex: 1, background: "#f0fdf4", border: "2px solid #bbf7d0", color: "#16a34a", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Withdraw</button>
                </div>
                {[
                  { label: "Pending Withdrawals", value: `GH₵${(data.pending_commission ?? 0).toFixed(2)}` },
                  { label: "Total Earnings Balance", value: `GH₵${(data.commission_balance ?? 0).toFixed(2)}` },
                  { label: "Total Revenue Generated", value: `GH₵${(data.total_revenue ?? 0).toFixed(2)}` },
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${M.border}` }}>
                    <span style={{ fontSize: 12, color: M.muted }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: M.text }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Commission & Earnings */}
          {card(
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}` }}>
                <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Commission & Earnings</p>
              </div>
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, background: "#f8fafc", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: M.muted, margin: "0 0 6px", fontWeight: 600 }}>Agent Type</p>
                    <p style={{ fontSize: 12, fontWeight: 800, color: isPriceMode ? M.purple : "#16a34a", margin: 0 }}>{isPriceMode ? "Price Mode" : "Commission"}</p>
                  </div>
                  <div style={{ flex: 1, background: "#f8fafc", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: M.muted, margin: "0 0 6px", fontWeight: 600 }}>This Month</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: M.text, margin: 0 }}>GH₵{ms.revenue.toFixed(2)}</p>
                  </div>
                  <div style={{ flex: 1, background: "#f8fafc", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: M.muted, margin: "0 0 6px", fontWeight: 600 }}>Total Earned</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: M.text, margin: 0 }}>GH₵{(data.total_revenue ?? 0).toFixed(2)}</p>
                  </div>
                </div>
                {isPriceMode && (
                  <button onClick={() => onNavigate("prices")} style={{ width: "100%", background: "linear-gradient(90deg,#7c3aed,#6d28d9)", color: "white", border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    ✏️ Manage My Prices
                  </button>
                )}
              </div>
            </>
          )}

          {/* Agent Level */}
          {card(
            <div style={{ padding: "20px", background: "linear-gradient(135deg,#3b82f6,#7c3aed)", borderRadius: 16 }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 6px" }}>Agent Level</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{tier.icon}</span>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 900, color: "white", margin: 0 }}>{tier.name} Agent</p>
                  {tier.next && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: "2px 0 0" }}>GH₵{tier.remaining.toFixed(0)} away from {tier.next}</p>}
                </div>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${tier.pct}%`, background: "white", borderRadius: 3, transition: "width 0.6s ease" }} />
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 700, margin: "0 0 8px" }}>Benefits at {tier.name} Level</p>
              {tier.benefits.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#4ade80" }}>✓</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>{b}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          {card(
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}` }}>
                <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Quick Actions</p>
              </div>
              <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Place Order", icon: "🛒", action: () => onNavigate("place_order"), bg: "#eff6ff", color: M.blue },
                  { label: isPriceMode ? "My Prices" : "My Referrals", icon: isPriceMode ? "🏷️" : "🔗", action: () => onNavigate(isPriceMode ? "prices" : "referrals"), bg: "#f5f3ff", color: M.purple },
                  { label: "Fund Wallet", icon: "💳", action: onAddFunds, bg: "#faf5ff", color: M.purple },
                  { label: "Withdraw", icon: "💸", action: onWithdraw, bg: "#f0fdf4", color: "#16a34a" },
                  { label: "My Orders", icon: "📦", action: () => onNavigate("orders"), bg: "#fff7ed", color: M.amber },
                  { label: "Support", icon: "💬", action: () => window.open("https://wa.me/233509794503", "_blank"), bg: "#fef2f2", color: M.red },
                ].map(qa => (
                  <button key={qa.label} onClick={qa.action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px", borderRadius: 12, border: `1px solid ${M.border}`, background: qa.bg, cursor: "pointer", transition: "all 0.15s" }}>
                    <span style={{ fontSize: 20 }}>{qa.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: qa.color, textAlign: "center" }}>{qa.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Top Customers */}
          {topCustomers.length > 0 && card(
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Top Customers</p>
                <button onClick={() => onNavigate("customers")} style={{ background: "none", border: "none", color: M.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View All</button>
              </div>
              <div>
                {topCustomers.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < topCustomers.length - 1 ? `1px solid ${M.border}` : "none" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: ["#dbeafe", "#fce7f3", "#d1fae5", "#fef3c7", "#ede9fe"][i % 5], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: [M.blue, "#db2777", "#16a34a", M.amber, M.purple][i % 5], flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: M.text, margin: 0, fontFamily: "monospace" }}>{c.masked}</p>
                      <p style={{ fontSize: 11, color: M.muted, margin: 0 }}>{c.count} orders</p>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: M.text, margin: 0, flexShrink: 0 }}>GH₵{c.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Orders Page ──────────────────────────────────────────────────────────────
function OrdersPage({ orders, agentId, onPlaceOrder }: { orders: Order[]; agentId: string; onPlaceOrder: () => void }) {
  const [tab, setTab] = useState<"regular" | "manual">("regular");
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("ALL");
  const [manualOrders, setManualOrders] = useState<ManualOrder[]>([]);
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    if (tab !== "manual" || manualOrders.length > 0) return;
    setManualLoading(true);
    fetch(`/api/agents/manual-order?agentId=${agentId}`).then(r => r.json()).then(d => { setManualOrders(d.orders ?? []); setManualLoading(false); }).catch(() => setManualLoading(false));
  }, [tab, agentId, manualOrders.length]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (filter !== "ALL" && o.status.toUpperCase() !== filter) return false;
      if (!q) return true;
      return (o.phone ?? "").includes(q) || (o.reference ?? "").toLowerCase().includes(q) || (o.network ?? "").toLowerCase().includes(q) || (o.bundle_size ?? "").toLowerCase().includes(q);
    });
  }, [orders, search, filter]);

  const filteredManual = useMemo(() => {
    const q = search.toLowerCase();
    return manualOrders.filter(o => {
      if (filter !== "ALL" && o.status.toUpperCase() !== filter) return false;
      if (!q) return true;
      return (o.customer_phone ?? "").includes(q) || (o.network ?? "").toLowerCase().includes(q) || (o.bundle_size ?? "").toLowerCase().includes(q);
    });
  }, [manualOrders, search, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>My Orders</h2>
          <p style={{ color: M.muted, fontSize: 13, margin: "2px 0 0" }}>{tab === "regular" ? `${orders.length} online orders` : `${manualOrders.length} manual orders`}</p>
        </div>
        <button onClick={onPlaceOrder} style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Place Order</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" style={{ background: "white", border: `1px solid ${M.border}`, borderRadius: 10, padding: "9px 14px", color: M.text, fontSize: 13, width: 200, outline: "none" }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["ALL", "COMPLETED", "PENDING", "PROCESSING", "FAILED"].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${filter === s ? M.blue : M.border}`, background: filter === s ? "#eff6ff" : "white", color: filter === s ? M.blue : M.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}</button>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8 }}>
        {([["regular", "Online Orders"], ["manual", "Manual Orders"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 18px", borderRadius: 10, border: `2px solid ${tab === t ? M.blue : M.border}`, background: tab === t ? "#eff6ff" : "white", color: tab === t ? M.blue : M.muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {tab === "regular" && (
        <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${M.border}` }}>
                  {["#", "Order ID", "Network", "Bundle", "Phone", "Amount", "Date", "Status"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: M.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => {
                  const nb = netBadge(o.network); const sb = statusBadge(o.status);
                  const shortRef = `#${(o.reference ?? "").replace(/[^A-Z0-9]/gi, "").slice(-7).toUpperCase()}`;
                  const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel|vodafone)\s+/i, "").trim();
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${M.border}` }}>
                      <td style={{ padding: "12px 16px", color: M.sub, fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: "12px 16px", color: M.blue, fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>{shortRef}</td>
                      <td style={{ padding: "12px 16px" }}><span style={{ background: nb.bg, color: nb.color, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{nb.label}</span></td>
                      <td style={{ padding: "12px 16px", color: M.text, fontWeight: 600 }}>{cleanSize}</td>
                      <td style={{ padding: "12px 16px", color: M.muted, fontFamily: "monospace", fontSize: 12 }}>{o.phone}</td>
                      <td style={{ padding: "12px 16px", color: M.text, fontWeight: 800 }}>GH₵{Number(o.amount).toFixed(2)}</td>
                      <td style={{ padding: "12px 16px", color: M.muted, fontSize: 12, whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td style={{ padding: "12px 16px" }}><span style={{ background: sb.bg, color: sb.color, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{sb.label}</span></td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 48, textAlign: "center", color: M.muted }}>No orders found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "manual" && (
        <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          {manualLoading ? <div style={{ padding: 48, textAlign: "center", color: M.muted }}>Loading…</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${M.border}` }}>
                    {["#", "Network", "Bundle", "Customer Phone", "Amount", "Commission", "Date", "Status"].map(h => (
                      <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: M.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredManual.map((o, i) => {
                    const nb = netBadge(o.network); const sb = statusBadge(o.status);
                    const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel|vodafone)\s+/i, "").trim();
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${M.border}` }}>
                        <td style={{ padding: "12px 16px", color: M.sub, fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: "12px 16px" }}><span style={{ background: nb.bg, color: nb.color, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{nb.label}</span></td>
                        <td style={{ padding: "12px 16px", color: M.text, fontWeight: 600 }}>{cleanSize}</td>
                        <td style={{ padding: "12px 16px", color: M.muted, fontFamily: "monospace", fontSize: 12 }}>{o.customer_phone}</td>
                        <td style={{ padding: "12px 16px", color: M.text, fontWeight: 800 }}>GH₵{Number(o.amount_paid).toFixed(2)}</td>
                        <td style={{ padding: "12px 16px", color: "#16a34a", fontWeight: 700 }}>GH₵{Number(o.agent_commission).toFixed(2)}</td>
                        <td style={{ padding: "12px 16px", color: M.muted, fontSize: 12, whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td style={{ padding: "12px 16px" }}><span style={{ background: sb.bg, color: sb.color, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{sb.label}</span></td>
                      </tr>
                    );
                  })}
                  {filteredManual.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 48, textAlign: "center", color: M.muted }}>
                      No manual orders yet. <button onClick={onPlaceOrder} style={{ background: "none", border: "none", color: M.blue, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Place your first order →</button>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Customers Page ───────────────────────────────────────────────────────────
function CustomersPage({ orders }: { orders: Order[] }) {
  const customers = useMemo(() => {
    const map: Record<string, { phone: string; count: number; total: number; lastDate: string; networks: Set<string> }> = {};
    for (const o of orders) {
      const k = o.phone ?? ""; if (!k) continue;
      if (!map[k]) map[k] = { phone: k, count: 0, total: 0, lastDate: o.created_at, networks: new Set() };
      map[k].count++; map[k].total += Number(o.amount);
      if (new Date(o.created_at) > new Date(map[k].lastDate)) map[k].lastDate = o.created_at;
      if (o.network) map[k].networks.add(o.network.toLowerCase());
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [orders]);

  const avatarColors = ["#dbeafe", "#fce7f3", "#d1fae5", "#fef3c7", "#ede9fe", "#fee2e2"];
  const textColors = [M.blue, "#db2777", "#16a34a", M.amber, M.purple, M.red];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>My Customers</h2>
        <p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>{customers.length} unique customers · {orders.length} total orders</p>
      </div>
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: `1px solid ${M.border}` }}>
              {["#", "Phone", "Orders", "Total Spent", "Networks", "Last Order"].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: M.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${M.border}` }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColors[i % avatarColors.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: textColors[i % textColors.length] }}>{i + 1}</div>
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 700, color: M.text }}>{c.phone}</td>
                <td style={{ padding: "12px 16px", fontWeight: 800, color: M.text }}>{c.count}</td>
                <td style={{ padding: "12px 16px", fontWeight: 800, color: "#16a34a" }}>GH₵{c.total.toFixed(2)}</td>
                <td style={{ padding: "12px 16px" }}>{[...c.networks].map(n => { const nb = netBadge(n); return <span key={n} style={{ background: nb.bg, color: nb.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800, marginRight: 4 }}>{nb.label}</span>; })}</td>
                <td style={{ padding: "12px 16px", color: M.muted, fontSize: 12 }}>{new Date(c.lastDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={6} style={{ padding: 48, textAlign: "center", color: M.muted }}>No customers yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Wallet Page ──────────────────────────────────────────────────────────────
function WalletPage({ data, onAddFunds, onWithdraw }: { data: AgentData; onAddFunds: () => void; onWithdraw: () => void }) {
  const [txns, setTxns] = useState<WalletTx[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/agents/wallet-transactions?agentId=${data.id}`).then(r => r.json()).then(d => { setTxns(d.transactions ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, [data.id]);
  const totalDep = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalWith = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Wallet</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }} className="wallet-grid">
        {[
          { label: "Working Capital", value: `GH₵${(data.wallet_balance ?? 0).toFixed(2)}`, sub: "For buying data", color: M.blue, action: onAddFunds, btnLabel: "+ Add Funds", btnStyle: "blue" },
          { label: "Earnings Balance", value: `GH₵${(data.commission_balance ?? 0).toFixed(2)}`, sub: "Available to withdraw", color: "#16a34a", action: onWithdraw, btnLabel: "Withdraw", btnStyle: "green" },
          { label: "Total Revenue", value: `GH₵${(data.total_revenue ?? 0).toFixed(2)}`, sub: "All-time sales", color: M.purple, action: null, btnLabel: "", btnStyle: "" },
        ].map(c => (
          <div key={c.label} style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: "20px" }}>
            <p style={{ fontSize: 12, color: M.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 8px" }}>{c.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: c.color, margin: "0 0 4px", lineHeight: 1 }}>{c.value}</p>
            <p style={{ fontSize: 12, color: M.muted, margin: "0 0 16px" }}>{c.sub}</p>
            {c.action && <button onClick={c.action} style={{ width: "100%", background: c.btnStyle === "blue" ? "linear-gradient(90deg,#3b82f6,#7c3aed)" : "linear-gradient(90deg,#16a34a,#15803d)", color: "white", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{c.btnLabel}</button>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[{ label: "Total Deposited", value: `GH₵${totalDep.toFixed(2)}`, color: "#16a34a", icon: "↓" }, { label: "Total Withdrawn", value: `GH₵${totalWith.toFixed(2)}`, color: M.red, icon: "↑" }].map(r => (
          <div key={r.label} style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: r.color === "#16a34a" ? "#dcfce7" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: r.color }}>{r.icon}</div>
            <div><p style={{ fontSize: 12, color: M.muted, fontWeight: 600, margin: "0 0 4px" }}>{r.label}</p><p style={{ fontSize: 20, fontWeight: 900, color: M.text, margin: 0 }}>{r.value}</p></div>
          </div>
        ))}
      </div>
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}` }}><p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Transaction History</p></div>
        {loading ? <div style={{ padding: 40, textAlign: "center", color: M.muted }}>Loading…</div> : txns.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}><p style={{ fontSize: 36, margin: "0 0 8px" }}>📋</p><p style={{ color: M.muted, fontSize: 14 }}>No transactions yet.</p></div>
        ) : txns.map((t, i) => {
          const pos = t.amount > 0;
          return (
            <div key={t.id ?? i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < txns.length - 1 ? `1px solid ${M.border}` : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: pos ? "#dcfce7" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: pos ? "#16a34a" : M.red, flexShrink: 0 }}>{pos ? "↓" : "↑"}</div>
              <div style={{ flex: 1 }}><p style={{ color: M.text, fontWeight: 600, fontSize: 14, margin: 0 }}>{t.description || t.type}</p><p style={{ color: M.muted, fontSize: 12, margin: 0 }}>{new Date(t.created_at).toLocaleString("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
              <p style={{ fontWeight: 800, fontSize: 15, margin: 0, color: pos ? "#16a34a" : M.red }}>{pos ? "+" : ""}GH₵{Math.abs(t.amount).toFixed(2)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Prices Page (Price-Mode Agents) ─────────────────────────────────────────
type BundleItem = { id: string; network: string; size: string; sizeGB: number; validity: string; price: number; costPrice: number };
function PricesPage({ data }: { data: AgentData }) {
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({});
  const [agentPrices, setAgentPrices] = useState<Record<string, number>>({});
  const [dbBundles, setDbBundles] = useState<BundleItem[]>([]);
  const [editing, setEditing] = useState<{ bundleId: string; val: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeNet, setActiveNet] = useState<"mtn" | "telecel" | "airteltigo">("mtn");

  useEffect(() => {
    Promise.all([fetch("/api/bundles").then(r => r.json()), fetch("/api/agent-tier-prices").then(r => r.json()), fetch(`/api/agents/prices?agentId=${data.id}`).then(r => r.json())]).then(([b, tier, agent]) => {
      setDbBundles(b.bundles ?? []);
      const tm: Record<string, number> = {}; for (const p of (tier.prices ?? [])) tm[p.bundle_id] = Number(p.price); setTierPrices(tm);
      const am: Record<string, number> = {}; for (const p of (agent.prices ?? [])) am[p.bundle_id] = Number(p.custom_price); setAgentPrices(am);
    });
  }, [data.id]);

  async function savePrice(bundleId: string, price: number) {
    const bundle = dbBundles.find(b => b.id === bundleId); if (!bundle) return;
    const base = tierPrices[bundleId] ?? bundle.costPrice;
    if (price < base) { setMsg({ text: `Price must be at least GH₵${base.toFixed(2)}.`, ok: false }); setTimeout(() => setMsg(null), 4000); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/agents/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: data.id, bundleId, customPrice: price, active: true, referralCode: data.referral_code }) });
      const d = await res.json();
      if (d.success) { setAgentPrices(p => ({ ...p, [bundleId]: price })); setMsg({ text: "✓ Price saved!", ok: true }); }
      else setMsg({ text: d.error ?? "Save failed.", ok: false });
    } catch { setMsg({ text: "Network error.", ok: false }); }
    finally { setSaving(false); setEditing(null); setTimeout(() => setMsg(null), 3000); }
  }

  const nets: { id: "mtn" | "telecel" | "airteltigo"; label: string }[] = [{ id: "mtn", label: "MTN" }, { id: "telecel", label: "Telecel" }, { id: "airteltigo", label: "AirtelTigo" }];
  const netColor: Record<string, string> = { mtn: M.amber, telecel: M.red, airteltigo: M.purple };
  const filtered = dbBundles.filter(b => b.network === activeNet);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>My Selling Prices</h2><p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Set your markup above admin base price. The difference is your profit.</p></div>
      {msg && <div style={{ padding: "12px 16px", borderRadius: 12, background: msg.ok ? "#dcfce7" : "#fee2e2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, color: msg.ok ? "#16a34a" : M.red, fontSize: 14, fontWeight: 700 }}>{msg.text}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {nets.map(n => <button key={n.id} onClick={() => setActiveNet(n.id)} style={{ padding: "8px 20px", borderRadius: 10, border: `2px solid ${activeNet === n.id ? netColor[n.id] : M.border}`, background: activeNet === n.id ? `${netColor[n.id]}15` : "white", color: activeNet === n.id ? netColor[n.id] : M.muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{n.label}</button>)}
      </div>
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 150px", gap: 0, padding: "10px 20px", borderBottom: `1px solid ${M.border}`, background: "#f8fafc" }}>
          {["Bundle", "Admin Price", "My Price", "Profit"].map(h => <p key={h} style={{ color: M.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>{h}</p>)}
        </div>
        {filtered.map((b, i) => {
          const base = tierPrices[b.id] ?? b.costPrice; const myPrice = agentPrices[b.id];
          const profit = myPrice ? (myPrice - base) : null; const isEditing = editing?.bundleId === b.id;
          return (
            <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 150px", gap: 0, padding: "14px 20px", borderTop: i > 0 ? `1px solid ${M.border}` : "none", alignItems: "center" }}>
              <div><p style={{ color: M.text, fontWeight: 700, fontSize: 14, margin: "0 0 2px" }}>{b.size}</p><p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{b.validity}</p></div>
              <p style={{ color: M.muted, fontWeight: 600, fontSize: 14, margin: 0 }}>GH₵{base.toFixed(2)}</p>
              <div>
                {isEditing ? <input type="number" step="0.5" autoFocus value={editing.val} onChange={e => setEditing(p => p ? { ...p, val: e.target.value } : p)} style={{ background: "#f8fafc", border: `2px solid ${M.blue}`, borderRadius: 8, padding: "7px 10px", color: M.text, fontSize: 14, width: 100, outline: "none" }} onKeyDown={e => { if (e.key === "Enter") savePrice(b.id, parseFloat(editing.val)); if (e.key === "Escape") setEditing(null); }} />
                  : <button onClick={() => setEditing({ bundleId: b.id, val: String(myPrice ?? (base + 1).toFixed(2)) })} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><span style={{ fontSize: 15, fontWeight: 800, color: myPrice ? "#16a34a" : M.muted }}>{myPrice ? `GH₵${myPrice.toFixed(2)}` : "Tap to set"}</span></button>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {profit !== null && <span style={{ fontSize: 12, color: "#16a34a", background: "#dcfce7", padding: "3px 8px", borderRadius: 20, fontWeight: 700 }}>+GH₵{profit.toFixed(2)}</span>}
                {isEditing ? <div style={{ display: "flex", gap: 6 }}><button onClick={() => savePrice(b.id, parseFloat(editing.val))} disabled={saving} style={{ background: M.blue, color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button><button onClick={() => setEditing(null)} style={{ background: "#f1f5f9", color: M.muted, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>✕</button></div>
                  : <button onClick={() => setEditing({ bundleId: b.id, val: String(myPrice ?? (base + 1).toFixed(2)) })} style={{ background: "#f1f5f9", border: `1px solid ${M.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, color: M.muted, cursor: "pointer", fontWeight: 600 }}>Edit</button>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: M.muted }}>No bundles found for {activeNet}</div>}
      </div>
    </div>
  );
}

// ─── Place Order Page ─────────────────────────────────────────────────────────
function PlaceOrderPage({ data }: { data: AgentData }) {
  const [activeNet, setActiveNet] = useState<"mtn" | "telecel" | "airteltigo">("mtn");
  const [dbBundles, setDbBundles] = useState<BundleItem[]>([]);
  const [selected, setSelected] = useState<BundleItem | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<ManualOrder[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bundles").then(r => r.json()).then(d => setDbBundles(d.bundles ?? []));
    fetch(`/api/agents/manual-order?agentId=${data.id}`).then(r => r.json()).then(d => { setHistory(d.orders ?? []); setHistLoading(false); }).catch(() => setHistLoading(false));
  }, [data.id]);

  async function submitOrder() {
    const cleaned = phone.replace(/\s/g, "");
    if (!selected) { setMsg({ text: "Select a bundle first.", ok: false }); return; }
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setMsg({ text: "Enter a valid Ghana phone number (e.g. 0241234567).", ok: false }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await fetch("/api/agents/manual-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: data.id, agentCode: data.referral_code, agentName: data.name, customerPhone: cleaned, network: selected.network, bundleId: selected.id, bundleSize: selected.size }) });
      const d = await res.json();
      if (d.success) {
        setMsg({ text: `✅ Order placed for ${cleaned}! Admin will fulfill it shortly.`, ok: true });
        setPhone(""); setSelected(null);
        setHistory(prev => [d.order, ...prev]);
      } else setMsg({ text: d.error ?? "Failed to place order.", ok: false });
    } catch { setMsg({ text: "Network error. Try again.", ok: false }); }
    finally { setLoading(false); }
  }

  const nets: { id: "mtn" | "telecel" | "airteltigo"; label: string }[] = [{ id: "mtn", label: "MTN" }, { id: "telecel", label: "Telecel" }, { id: "airteltigo", label: "AirtelTigo" }];
  const netColor: Record<string, string> = { mtn: M.amber, telecel: M.red, airteltigo: M.purple };
  const netBundles = dbBundles.filter(b => b.network === activeNet);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div><h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Place a Manual Order</h2><p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Submit a data order for your customer. Admin will fulfill it and credit your commission.</p></div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }} className="main-grid">
        {/* Bundle picker */}
        <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}` }}>
            <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Select Bundle</p>
          </div>
          <div style={{ padding: "14px 20px", display: "flex", gap: 8 }}>
            {nets.map(n => <button key={n.id} onClick={() => { setActiveNet(n.id); setSelected(null); }} style={{ padding: "8px 18px", borderRadius: 10, border: `2px solid ${activeNet === n.id ? netColor[n.id] : M.border}`, background: activeNet === n.id ? `${netColor[n.id]}18` : "white", color: activeNet === n.id ? netColor[n.id] : M.muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{n.label}</button>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {netBundles.map((b, i) => {
              const isSel = selected?.id === b.id;
              return (
                <button key={b.id} onClick={() => setSelected(b)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: i > 0 ? `1px solid ${M.border}` : "none", background: isSel ? "#eff6ff" : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <p style={{ fontWeight: 800, color: isSel ? M.blue : M.text, fontSize: 15, margin: 0 }}>{b.size}</p>
                    <p style={{ color: M.muted, fontSize: 12, margin: "2px 0 0" }}>{b.validity}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontWeight: 900, color: isSel ? M.blue : M.text, fontSize: 16, margin: 0 }}>GH₵{b.price.toFixed(2)}</p>
                    {isSel && <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: M.blue, padding: "2px 8px", borderRadius: 20 }}>Selected ✓</span>}
                  </div>
                </button>
              );
            })}
            {netBundles.length === 0 && <div style={{ padding: 40, textAlign: "center", color: M.muted }}>Loading bundles…</div>}
          </div>
        </div>

        {/* Order summary + submit */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: 20 }}>
            <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: "0 0 16px" }}>Order Details</p>
            {selected ? (
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: `2px solid ${M.blue}` }}>
                <p style={{ color: M.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", margin: "0 0 4px" }}>Selected Bundle</p>
                <p style={{ color: M.text, fontWeight: 900, fontSize: 18, margin: "0 0 2px" }}>{selected.size} — {selected.network.toUpperCase()}</p>
                <p style={{ color: M.muted, fontSize: 12, margin: 0 }}>{selected.validity} · GH₵{selected.price.toFixed(2)}</p>
              </div>
            ) : (
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center", color: M.muted, fontSize: 13 }}>← Pick a bundle from the list</div>
            )}
            <p style={{ fontSize: 12, color: M.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 6px" }}>Customer Phone Number</p>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0241234567" style={{ background: "#f8fafc", border: `1px solid ${M.border}`, borderRadius: 10, padding: "11px 14px", color: M.text, fontSize: 16, fontWeight: 700, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 16 }} />
            {msg && <div style={{ padding: "10px 14px", borderRadius: 10, background: msg.ok ? "#dcfce7" : "#fee2e2", color: msg.ok ? "#16a34a" : M.red, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{msg.text}</div>}
            <button onClick={submitOrder} disabled={loading || !selected} style={{ width: "100%", background: !selected || loading ? "#94a3b8" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 800, cursor: !selected || loading ? "not-allowed" : "pointer" }}>
              {loading ? "Placing Order…" : selected ? `Place Order · GH₵${selected.price.toFixed(2)}` : "Select a Bundle"}
            </button>
            <p style={{ color: M.muted, fontSize: 11, textAlign: "center", margin: "10px 0 0" }}>Admin will fulfill within minutes. Commission credited on completion.</p>
          </div>

          {/* Recent manual orders */}
          <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${M.border}` }}>
              <p style={{ fontWeight: 800, color: M.text, fontSize: 14, margin: 0 }}>Recent Manual Orders</p>
            </div>
            {histLoading ? <div style={{ padding: 24, textAlign: "center", color: M.muted, fontSize: 13 }}>Loading…</div> : history.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: M.muted, fontSize: 13 }}>No manual orders yet</div>
            ) : history.slice(0, 5).map((o, i) => {
              const nb = netBadge(o.network); const sb = statusBadge(o.status);
              const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel|vodafone)\s+/i, "").trim();
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < Math.min(history.length, 5) - 1 ? `1px solid ${M.border}` : "none" }}>
                  <span style={{ background: nb.bg, color: nb.color, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{nb.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: M.text, fontWeight: 700, fontSize: 13, margin: 0 }}>{cleanSize} → {o.customer_phone}</p>
                    <p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                  </div>
                  <span style={{ background: sb.bg, color: sb.color, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{sb.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Referrals / Store Page ───────────────────────────────────────────────────
function ReferralsPage({ data }: { data: AgentData }) {
  const [copied, setCopied] = useState(false);
  const storeUrl = typeof window !== "undefined" ? `${window.location.origin}/shop/${data.referral_code}` : `/shop/${data.referral_code}`;
  function copyLink() { navigator.clipboard.writeText(storeUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      <div><h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>My Referrals & Store</h2><p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Share your store link to earn from every customer purchase.</p></div>
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: 28, textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "white", borderRadius: 16, padding: 16, marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <QRCodeSVG value={storeUrl} size={160} />
        </div>
        <p style={{ color: M.text, fontWeight: 800, fontSize: 18, margin: "0 0 6px" }}>My Store Link</p>
        <p style={{ color: M.muted, fontSize: 14, margin: "0 0 20px" }}>Your referral code: <strong style={{ color: M.blue }}>{data.referral_code}</strong></p>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, border: `1px solid ${M.border}` }}>
          <p style={{ color: M.muted, fontSize: 13, margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>{storeUrl}</p>
          <button onClick={copyLink} style={{ background: copied ? "#16a34a" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.open(storeUrl, "_blank")} style={{ flex: 1, background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Open Store ↗</button>
          <button onClick={copyLink} style={{ flex: 1, background: "#f8fafc", border: `1px solid ${M.border}`, color: M.muted, borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Share Link</button>
        </div>
      </div>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 16, padding: 18 }}>
        <p style={{ color: "#16a34a", fontWeight: 700, fontSize: 14, margin: "0 0 8px" }}>💡 How it works</p>
        <ul style={{ color: M.muted, fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 2 }}>
          <li>Customer visits your link and picks a bundle</li>
          <li>They pay your set price (or admin price for commission agents)</li>
          <li>Successful delivery adds to your earnings balance</li>
          <li>Withdraw your earnings anytime via mobile money</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Leaderboard Page ─────────────────────────────────────────────────────────
function LeaderboardPage({ myCode }: { myCode: string }) {
  const [leaders, setLeaders] = useState<{ rank: number; name: string; referral_code: string; total_sales: number; total_revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/agents/leaderboard").then(r => r.json()).then(d => { setLeaders(d.leaders ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  const avatarColors = ["#fef3c7", "#f1f5f9", "#fffbeb", "#dbeafe", "#f5f3ff"];
  const textColors = [M.amber, M.muted, "#d97706", M.blue, M.purple];
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Agent Leaderboard</h2><p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Top performing agents ranked by total sales.</p></div>
      {loading ? <div style={{ padding: 60, textAlign: "center", color: M.muted }}>Loading…</div> : (
        <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          {leaders.map((a, i) => {
            const isMe = a.referral_code === myCode;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < leaders.length - 1 ? `1px solid ${M.border}` : "none", background: isMe ? "#eff6ff" : "white" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: avatarColors[i % avatarColors.length], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: textColors[i % textColors.length], flexShrink: 0, fontSize: i < 3 ? 18 : 13 }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ color: M.text, fontWeight: 700, fontSize: 14, margin: 0 }}>{a.name}</p>
                    {isMe && <span style={{ fontSize: 10, fontWeight: 800, background: "#dbeafe", color: M.blue, padding: "2px 6px", borderRadius: 20 }}>You</span>}
                  </div>
                  <p style={{ color: M.muted, fontSize: 12, margin: 0 }}>@{a.referral_code}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ color: M.text, fontWeight: 900, fontSize: 14, margin: 0 }}>GH₵{Number(a.total_revenue).toFixed(0)}</p>
                  <p style={{ color: M.muted, fontSize: 12, margin: 0 }}>{a.total_sales} sales</p>
                </div>
              </div>
            );
          })}
          {leaders.length === 0 && <div style={{ padding: 60, textAlign: "center" }}><p style={{ fontSize: 36, margin: "0 0 8px" }}>🏆</p><p style={{ color: M.muted }}>No data yet.</p></div>}
        </div>
      )}
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────
function ProfilePage({ data }: { data: AgentData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      <div><h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Agent Profile</h2></div>
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${M.border}` }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "white" }}>
            {(data.name ?? "A").charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ color: M.text, fontWeight: 900, fontSize: 18, margin: 0 }}>{data.name}</p>
            <p style={{ color: M.muted, fontSize: 13, margin: "4px 0" }}>{data.email}</p>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a", padding: "3px 10px", borderRadius: 20 }}>Active Agent</span>
          </div>
        </div>
        {[
          { label: "Referral Code", value: data.referral_code, mono: true },
          { label: "Phone", value: data.phone || "—", mono: true },
          { label: "Business Name", value: data.business_name || "—" },
          { label: "Agent Type", value: data.agent_type === "custom_price" ? "Price Mode Agent" : "Commission Agent" },
          { label: "All-time Sales", value: String(data.total_sales ?? 0) },
          { label: "All-time Orders Loaded", value: String(data.orders.length) },
          { label: "Total Revenue Generated", value: `GH₵${(data.total_revenue ?? 0).toFixed(2)}` },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${M.border}` }}>
            <span style={{ fontSize: 13, color: M.muted, fontWeight: 600 }}>{r.label}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: M.text, fontFamily: r.mono ? "monospace" : "inherit" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// ─── API Page ─────────────────────────────────────────────────────────────────
function ApiPage({ data }: { data: AgentData }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://www.elitedata1.com";

  useEffect(() => {
    fetch(`/api/agents/api-key?agentId=${data.id}`)
      .then(r => r.json())
      .then(d => { setApiKey(d.key ?? null); setWalletBalance(Number(d.wallet_balance ?? 0)); })
      .finally(() => setLoading(false));
  }, [data.id]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(null), 2000); });
  }

  const maskedKey = apiKey ? apiKey.slice(0, 10) + "••••••••••••••••••••••••••••••••••••" : "";
  const exampleBody = `{
  "network": "MTN",
  "phone": "0241234567",
  "datasize": 1,
  "reference": "YOUR-UNIQUE-REF-001"
}`;
  const exampleResponse = `{
  "success": true,
  "status": "completed",
  "network": "MTN",
  "phone": "0241234567",
  "datasize": "1GB",
  "amount_charged": 4.25,
  "wallet_balance": 95.75
}`;

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><div style={{ width: 32, height: 32, border: "3px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1e3a5f,#0d2137)", border: `1px solid ${M.border}`, borderRadius: 20, padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#f8fafc", margin: "0 0 6px" }}>Developer API</p>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Use this key to integrate Elite Data bundles into your own website or app.</p>
          </div>
          <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 12, padding: "8px 14px", textAlign: "center", flexShrink: 0 }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa", margin: 0 }}>GH₵{walletBalance.toFixed(2)}</p>
            <p style={{ fontSize: 10, color: "#64748b", margin: "2px 0 0", fontWeight: 600, textTransform: "uppercase" }}>API Wallet</p>
          </div>
        </div>
      </div>

      {/* API Key card */}
      <div style={{ background: "white", border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: M.muted, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Your API Key</p>
        <div style={{ background: "#f8fafc", border: `1px solid ${M.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <code style={{ flex: 1, fontSize: 13, color: "#0f172a", fontFamily: "monospace", wordBreak: "break-all" }}>
            {revealed ? apiKey : maskedKey}
          </code>
          <button onClick={() => setRevealed(v => !v)} style={{ background: "#f1f5f9", border: `1px solid ${M.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: M.muted, cursor: "pointer", flexShrink: 0 }}>
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => copy(apiKey ?? "", "key")} style={{ flex: 1, background: copied === "key" ? "#dcfce7" : "linear-gradient(90deg,#3b82f6,#7c3aed)", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, color: copied === "key" ? "#16a34a" : "white", cursor: "pointer" }}>
            {copied === "key" ? "✅ Copied!" : "📋 Copy API Key"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#ef4444", margin: "12px 0 0" }}>⚠️ Keep this key private. Anyone with it can place orders on your wallet.</p>
      </div>

      {/* How to use */}
      <div style={{ background: "white", border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: M.text, margin: "0 0 16px" }}>How to use it</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Step 1 */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: M.muted, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px" }}>Step 1 — Top up your API wallet first</p>
            <p style={{ fontSize: 13, color: M.muted, margin: 0 }}>Go to the <strong>Wallet</strong> tab → click <strong>Top Up Wallet</strong> → pay via Paystack. Your orders will be funded from this balance.</p>
          </div>

          {/* Step 2 */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: M.muted, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px" }}>Step 2 — Send a POST request to purchase a bundle</p>
            <div style={{ background: "#0f172a", borderRadius: 12, padding: "4px 0", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 6px" }}>
                <code style={{ fontSize: 11, color: "#94a3b8" }}>POST {siteUrl}/api/v1/agent-purchase</code>
                <button onClick={() => copy(`${siteUrl}/api/v1/agent-purchase`, "url")} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>
                  {copied === "url" ? "✅" : "Copy"}
                </button>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px 4px" }}>
                <p style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", margin: "0 0 6px" }}>Headers</p>
                <code style={{ fontSize: 12, color: "#7dd3fc", display: "block" }}>Authorization: Bearer {revealed ? apiKey : maskedKey}</code>
                <code style={{ fontSize: 12, color: "#7dd3fc", display: "block" }}>Content-Type: application/json</code>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <p style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", margin: 0 }}>Body (JSON)</p>
                  <button onClick={() => copy(exampleBody, "body")} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>
                    {copied === "body" ? "✅ Copied" : "Copy"}
                  </button>
                </div>
                <pre style={{ fontSize: 12, color: "#86efac", margin: 0, fontFamily: "monospace" }}>{exampleBody}</pre>
              </div>
            </div>
          </div>

          {/* Response */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: M.muted, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px" }}>Response</p>
            <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px" }}>
              <pre style={{ fontSize: 12, color: "#86efac", margin: 0, fontFamily: "monospace" }}>{exampleResponse}</pre>
            </div>
          </div>

          {/* Networks */}
          <div style={{ background: "#f8fafc", border: `1px solid ${M.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: M.muted, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 10px" }}>Supported networks & datasize values</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { net: "MTN", sizes: "1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50", color: "#f59e0b" },
                { net: "TELECEL", sizes: "1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50", color: "#ef4444" },
                { net: "AIRTELTIGO", sizes: "1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50", color: "#8b5cf6" },
              ].map(n => (
                <div key={n.net} style={{ background: "white", border: `1px solid ${M.border}`, borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: n.color, margin: "0 0 4px" }}>{n.net}</p>
                  <p style={{ fontSize: 11, color: M.muted, margin: 0 }}>datasize: {n.sizes} (GB)</p>
                </div>
              ))}
            </div>
          </div>

          {/* reference note */}
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 16px" }}>
            <p style={{ fontSize: 13, color: "#92400e", margin: 0 }}><strong>reference</strong> must be unique for every order. Use your own order ID or a timestamp e.g. <code>ORD-{Date.now()}</code>. Duplicate references are ignored (idempotent).</p>
          </div>
        </div>
      </div>

      {/* Get bundles list */}
      <div style={{ background: "white", border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: M.text, margin: "0 0 8px" }}>Get available bundles &amp; prices</p>
        <p style={{ fontSize: 13, color: M.muted, margin: "0 0 12px" }}>Call this endpoint to get real-time bundle prices to show on your website:</p>
        <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <code style={{ fontSize: 12, color: "#7dd3fc" }}>GET {siteUrl}/api/v1/bundles</code>
          <button onClick={() => copy(`${siteUrl}/api/v1/bundles`, "bundles")} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>
            {copied === "bundles" ? "✅" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: M.muted, margin: "10px 0 0" }}>No authentication needed. Returns all active bundles with network, size and price.</p>
      </div>

    </div>
  );
}

function Sidebar({ page, setPage, data, onLogout, onWithdraw, open, onClose }: { page: Page; setPage: (p: Page) => void; data: AgentData; onLogout: () => void; onWithdraw: () => void; open: boolean; onClose: () => void }) {
  const isPriceMode = data.agent_type === "custom_price";
  const initial1 = (data.name ?? "A").charAt(0).toUpperCase();
  const initial2 = (data.name ?? "").split(" ")[1]?.charAt(0).toUpperCase() ?? "";
  const agentId = "AGT-" + (data.referral_code ?? "????").slice(0, 5).padEnd(5, "0");

  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: "dashboard",   label: "Dashboard",    icon: "🏠" },
    { id: "place_order", label: "Place Order",  icon: "🛒" },
    { id: "prices",      label: isPriceMode ? "My Prices" : "My Referrals", icon: isPriceMode ? "🏷️" : "🔗" },
    { id: "orders",      label: "My Orders",    icon: "📦" },
    { id: "customers",   label: "My Customers", icon: "👥" },
    { id: "wallet",      label: "Wallet",       icon: "💳" },
    { id: "transactions",label: "Transactions", icon: "🔄" },
    { id: "leaderboard", label: "Leaderboard",  icon: "🏆" },
    { id: "api",         label: "Developer API", icon: "🔌" },
    { id: "profile",     label: "Agent Profile",icon: "👤" },
    { id: "settings",    label: "Settings",     icon: "⚙️" },
  ];

  const storeUrl = typeof window !== "undefined" ? `${window.location.origin}/shop/${data.referral_code}` : `/shop/${data.referral_code}`;
  const [refCopied, setRefCopied] = useState(false);
  function copyRef() { navigator.clipboard.writeText(storeUrl).then(() => { setRefCopied(true); setTimeout(() => setRefCopied(false), 2000); }); }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />}
      <aside style={{ position: "fixed", top: 0, left: open ? 0 : -264, bottom: 0, width: 252, background: SB.bg, borderRight: `1px solid ${SB.border}`, display: "flex", flexDirection: "column", zIndex: 50, transition: "left 0.25s ease" }} className="sidebar-desktop">

        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${SB.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "white", fontSize: 16 }}>E</div>
            <div><p style={{ color: SB.text, fontWeight: 900, fontSize: 15, margin: 0 }}>Elite Data</p><p style={{ color: "#4ade80", fontSize: 10, margin: 0, fontWeight: 700 }}>Agent Portal</p></div>
          </div>
        </div>

        {/* Agent card */}
        <div style={{ margin: "12px 12px 4px", background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 14px 12px", border: `1px solid ${SB.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#14b8a6,#0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "white", flexShrink: 0 }}>{initial1}{initial2}</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: SB.text, fontWeight: 700, fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.name}</p>
              <p style={{ color: SB.muted, fontSize: 11, margin: "2px 0 0" }}>ID: {agentId}</p>
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(74,222,128,0.15)", color: "#4ade80", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(74,222,128,0.3)" }}>● Active Agent</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
          {navItems.map(item => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => { setPage(item.id); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "rgba(59,130,246,0.2)" : "transparent", color: active ? "#60a5fa" : SB.muted, fontSize: 13, fontWeight: active ? 700 : 500, textAlign: "left", marginBottom: 2, borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent", transition: "all 0.15s" }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Refer & Earn promo */}
        <div style={{ margin: "0 12px 12px", background: "linear-gradient(135deg,rgba(59,130,246,0.15),rgba(124,58,237,0.15))", borderRadius: 14, padding: "14px", border: `1px solid ${SB.border}` }}>
          <p style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13, margin: "0 0 4px" }}>🎁 Refer & Earn More!</p>
          <p style={{ color: SB.muted, fontSize: 11, margin: "0 0 10px", lineHeight: 1.5 }}>Earn when your referrals buy through your link.</p>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "6px 10px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: SB.muted, fontSize: 10, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>.../{data.referral_code}</span>
            <button onClick={copyRef} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{refCopied ? "✓" : "Copy"}</button>
          </div>
          <button onClick={() => { setPage("referrals"); onClose(); }} style={{ width: "100%", background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>View My Store</button>
        </div>

        {/* Support + Logout */}
        <div style={{ padding: "0 10px 16px", borderTop: `1px solid ${SB.border}`, paddingTop: 8 }}>
          <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, textDecoration: "none", color: "#4ade80", fontSize: 13, fontWeight: 600 }}>
            💬 WhatsApp Support
          </a>
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: "transparent", color: "#f87171", fontSize: 13, fontWeight: 600, textAlign: "left", width: "100%" }}>
            ⬅️ Logout
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
function SettingsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Settings</h2>
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: 24 }}>
        <p style={{ color: M.text, fontWeight: 700, fontSize: 15, margin: "0 0 8px" }}>Account Settings</p>
        <p style={{ color: M.muted, fontSize: 13 }}>Contact admin on WhatsApp to update your account details, email, or password.</p>
        <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#dcfce7", border: "1px solid #bbf7d0", color: "#16a34a", textDecoration: "none", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 700, marginTop: 12 }}>
          💬 Contact Admin on WhatsApp
        </a>
      </div>
    </div>
  );
}

// ─── Transactions redirect to Wallet ─────────────────────────────────────────
function TransactionsPage({ data, onAddFunds, onWithdraw }: { data: AgentData; onAddFunds: () => void; onWithdraw: () => void }) {
  return <WalletPage data={data} onAddFunds={onAddFunds} onWithdraw={onWithdraw} />;
}

// ─── Agent App ────────────────────────────────────────────────────────────────
function AgentApp({ data, onLogout, onRefresh }: { data: AgentData; onLogout: () => void; onRefresh: () => void }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as Record<string, unknown>).PaystackPop) return;
    if (document.querySelector('script[src*="paystack"]')) return;
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  const pageTitle: Record<Page, string> = {
    dashboard: "Agent Dashboard", orders: "My Orders", customers: "My Customers",
    wallet: "Wallet", transactions: "Transaction History", referrals: "My Referrals & Store",
    leaderboard: "Leaderboard", api: "Developer API", profile: "Agent Profile", settings: "Settings",
    prices: data.agent_type === "custom_price" ? "My Selling Prices" : "My Referrals & Store",
    place_order: "Place Order",
  };

  return (
    <div style={{ minHeight: "100vh", background: M.bg, display: "flex" }}>
      <Sidebar page={page} setPage={setPage} data={data} onLogout={onLogout} onWithdraw={() => setShowWithdraw(true)} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }} className="main-with-sidebar">
        {/* Header */}
        <header style={{ background: "white", borderBottom: `1px solid ${M.border}`, padding: "0 24px", height: 64, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 30, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <button onClick={() => setSidebarOpen(true)} className="sidebar-toggle" style={{ background: "transparent", border: "none", color: M.muted, cursor: "pointer", padding: 6, lineHeight: 0, display: "none" }}>
            <svg width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: M.text, margin: 0 }}>{pageTitle[page]} {page === "dashboard" ? "👋" : ""}</p>
            {page === "dashboard" && <p style={{ fontSize: 13, color: M.muted, margin: 0 }}>Welcome back, {data.name.split(" ")[0]}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={onRefresh} style={{ background: "#f8fafc", border: `1px solid ${M.border}`, borderRadius: 10, color: M.muted, cursor: "pointer", padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>🔄 Refresh</button>
            <div style={{ position: "relative" }}>
              <svg width={22} height={22} fill="none" stroke={M.muted} strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: `1px solid ${M.border}`, borderRadius: 12, padding: "6px 12px" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "white" }}>
                {(data.name ?? "A").charAt(0).toUpperCase()}{(data.name ?? "").split(" ")[1]?.charAt(0).toUpperCase() ?? ""}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: M.text }} className="hide-mobile">{data.name.split(" ")[0]}</span>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: "24px 20px", overflowY: "auto", maxWidth: 1280, width: "100%", margin: "0 auto" }}>
          {page === "dashboard"    && <DashboardPage data={data} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} onNavigate={setPage} />}
          {page === "orders"       && <OrdersPage orders={data.orders} agentId={data.id} onPlaceOrder={() => setPage("place_order")} />}
          {page === "customers"    && <CustomersPage orders={data.orders} />}
          {page === "wallet"       && <WalletPage data={data} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} />}
          {page === "transactions" && <TransactionsPage data={data} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} />}
          {page === "referrals"    && <ReferralsPage data={data} />}
          {page === "leaderboard"  && <LeaderboardPage myCode={data.referral_code} />}
          {page === "api"          && <ApiPage data={data} />}
          {page === "profile"      && <ProfilePage data={data} />}
          {page === "settings"     && <SettingsPage />}
          {page === "prices"       && (data.agent_type === "custom_price" ? <PricesPage data={data} /> : <ReferralsPage data={data} />)}
          {page === "place_order"  && <PlaceOrderPage data={data} />}
        </main>
      </div>

      {showAddFunds && <AddFundsModal agentId={data.id} agentEmail={data.email} onClose={() => setShowAddFunds(false)} onSuccess={onRefresh} />}
      {showWithdraw && <WithdrawModal agentId={data.id} referralCode={data.referral_code} profitBalance={data.commission_balance ?? 0} onClose={() => setShowWithdraw(false)} onSuccess={onRefresh} />}

      <style>{`
        @media (min-width: 768px) {
          .sidebar-desktop { left: 0 !important; }
          .main-with-sidebar { margin-left: 252px; }
          .sidebar-toggle { display: none !important; }
          .hide-mobile { display: inline !important; }
        }
        @media (max-width: 767px) {
          .sidebar-toggle { display: flex !important; }
          .stat-grid { grid-template-columns: 1fr 1fr !important; }
          .main-grid { grid-template-columns: 1fr !important; }
          .wallet-grid { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none; }
        }
        @media (min-width: 768px) and (max-width: 1199px) {
          .stat-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function DashboardInner() {
  const searchParams = useSearchParams();
  const [agentData, setAgentData] = useState<AgentData | null>(null);

  const fetchAgent = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agents/dashboard?code=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (j.success) setAgentData(j.agent);
    } catch {}
  }, []);

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      fetch(`/api/agents/dashboard?code=${encodeURIComponent(code.toUpperCase())}`)
        .then(r => r.json()).then(j => { if (j.success) setAgentData(j.agent); });
    }
  }, [searchParams]);

  function handleLogout() { setAgentData(null); }
  function handleRefresh() { if (agentData?.referral_code) return fetchAgent(agentData.referral_code); return Promise.resolve(); }

  if (!agentData) return <LoginForm onLogin={setAgentData} />;
  return <AgentApp data={agentData} onLogout={handleLogout} onRefresh={handleRefresh} />;
}

export default function AgentDashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0d1b2e", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 36, height: 36, border: "3px solid rgba(59,130,246,0.3)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>}>
      <DashboardInner />
    </Suspense>
  );
}
