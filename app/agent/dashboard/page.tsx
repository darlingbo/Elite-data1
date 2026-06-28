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
  wallet_balance: number; commission_balance: number; paystack_wallet_balance?: number; pending_commission?: number;
  total_sales: number; total_revenue: number;
  agent_type: "commission" | "custom_price" | null;
  registration_ref?: string | null;
  business_name?: string | null;
  orders: Order[];
}
interface WalletTx {
  id: string; type: string; amount: number; description: string; created_at: string;
}
type Page = "dashboard" | "orders" | "customers" | "wallet" | "transactions" | "referrals" | "leaderboard" | "profile" | "settings" | "prices" | "place_order" | "api" | "buy_data" | "affiliate" | "notifications" | "support";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const SB = { bg: "#0d1b2e", border: "#1e3a5f", text: "#f8fafc", muted: "#94a3b8" };
const M = { bg: "#080f1e", card: "#0d1b2e", border: "#1e3a5f", text: "#f8fafc", muted: "#94a3b8", sub: "#64748b", blue: "#3b82f6", purple: "#7c3aed", green: "#4ade80", red: "#f87171", amber: "#f59e0b" };

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
      {[0.25, 0.5, 0.75, 1].map((t, i) => <line key={i} x1={pad.l} y1={pad.t + iH * (1 - t)} x2={W - pad.r} y2={pad.t + iH * (1 - t)} stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />)}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [forgotNewPass, setForgotNewPass] = useState<string | null>(null);
  const [passCopied, setPassCopied] = useState(false);

  async function handleLogin() {
    setError(""); setIsPending(false); setLoading(true);
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
      else {
        if (j.status === "pending") setIsPending(true);
        setError(j.error || "Login failed. Check your details.");
      }
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  }

  async function handleForgot() {
    if (!forgotEmail.trim()) { setForgotMsg({ text: "Enter your email address.", ok: false }); return; }
    setForgotLoading(true); setForgotMsg(null); setForgotNewPass(null);
    try {
      const res = await fetch("/api/agents/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }) });
      const j = await res.json();
      if (j.success && j.show && j.tempPassword) {
        setForgotNewPass(j.tempPassword);
        setForgotMsg({ text: j.message || "New password created. Copy it below then log in.", ok: true });
      } else {
        setForgotMsg({ text: j.error ?? j.message ?? "Done.", ok: !!j.success });
      }
    } catch { setForgotMsg({ text: "Network error. Try again.", ok: false }); }
    finally { setForgotLoading(false); }
  }

  const inp: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", color: "#0f172a", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" };

  if (showForgot) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0d1b2e,#1e1b4b)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 22, fontWeight: 900, color: "white" }}>E</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", margin: "0 0 6px" }}>Reset Password</h1>
            <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>Enter your email — your new password will appear right here</p>
          </div>
          <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            {forgotNewPass ? (
              /* Step 2 — show the new password */
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <p style={{ fontWeight: 900, fontSize: 17, color: "#0f172a", margin: "0 0 4px" }}>Account Confirmed!</p>
                  <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Here is your new temporary password:</p>
                </div>
                <div style={{ background: "rgba(255,255,255,0.05)", border: "2px dashed #3b82f6", borderRadius: 14, padding: "18px 20px", textAlign: "center" }}>
                  <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: 6, color: "#1e293b", margin: "0 0 8px", fontFamily: "monospace" }}>{forgotNewPass}</p>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(forgotNewPass ?? ""); setPassCopied(true); setTimeout(() => setPassCopied(false), 2500); }}
                    style={{ background: passCopied ? "#16a34a" : "#3b82f6", color: "white", border: "none", borderRadius: 8, padding: "7px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                  >
                    {passCopied ? "✓ Copied!" : "Copy Password"}
                  </button>
                </div>
                <p style={{ color: "#f59e0b", fontSize: 12, fontWeight: 600, textAlign: "center", margin: 0 }}>
                  Save this password before leaving this screen.
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotNewPass(null); setForgotMsg(null); setTab("email"); setEmail(forgotEmail); setPassword(forgotNewPass ?? ""); setForgotEmail(""); }}
                  style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}
                >
                  Go to Login
                </button>
              </div>
            ) : (
              /* Step 1 — enter email */
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Your Email Address</label>
                  <input style={inp} type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && handleForgot()} />
                </div>
                {forgotMsg && !forgotMsg.ok && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fee2e2", color: "#dc2626", fontSize: 13, fontWeight: 600 }}>
                    {forgotMsg.text}
                  </div>
                )}
                <button onClick={handleForgot} disabled={forgotLoading} style={{ background: forgotLoading ? "#94a3b8" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 800, cursor: forgotLoading ? "not-allowed" : "pointer" }}>
                  {forgotLoading ? "Checking…" : "Get New Password"}
                </button>
                <button onClick={() => { setShowForgot(false); setForgotMsg(null); setForgotNewPass(null); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const [leaving, setLeaving] = useState(false);
  function goRegister() {
    setLeaving(true);
    setTimeout(() => { window.location.href = "/agent"; }, 820);
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#060c1c 0%,#0d1b2e 60%,#1e1b4b 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>

      {/* ── Split-panel auth container ── */}
      <div className={`auth-container${leaving ? " active" : ""}`} style={{ position: "relative", width: "100%", maxWidth: 860, minHeight: 560, borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>

        {/* Form panel — login (full width, sits behind overlay) */}
        <div className="form-panel--login" style={{ position: "absolute", inset: 0, background: "white", display: "flex", alignItems: "center", padding: "40px 36px" }}>
          <div style={{ width: "100%", maxWidth: 360 }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "white", marginBottom: 14 }}>E</div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", margin: "0 0 4px" }}>Welcome back</h1>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Sign in to your Elite Data agent dashboard</p>
            </div>

            {/* Login type tabs */}
            <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 }}>
              {(["email", "code"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: tab === t ? "linear-gradient(90deg,#3b82f6,#7c3aed)" : "transparent", color: tab === t ? "white" : "#64748b", transition: "all .25s" }}>
                  {t === "email" ? "Email & Password" : "Referral Code"}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {tab === "email" ? (
                <>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8 }}>Email</label>
                    <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && handleLogin()} />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8 }}>Password</label>
                      <button type="button" onClick={() => setShowForgot(true)} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Forgot?</button>
                    </div>
                    <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} />
                  </div>
                </>
              ) : (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8 }}>Referral Code</label>
                  <input style={inp} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. STEP0001" onKeyDown={e => e.key === "Enter" && handleLogin()} />
                </div>
              )}
              {error && (
                <div style={{ background: isPending ? "#fef3c7" : "#fee2e2", border: `1px solid ${isPending ? "#fde68a" : "#fecaca"}`, borderRadius: 10, padding: "11px 13px" }}>
                  <p style={{ color: isPending ? "#92400e" : "#dc2626", fontSize: 13, margin: "0 0 5px", fontWeight: 700 }}>{isPending ? "⏳ Application Pending" : error}</p>
                  {isPending && <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#16a34a", color: "white", textDecoration: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>💬 Contact Admin</a>}
                </div>
              )}
              <button onClick={handleLogin} disabled={loading} style={{ background: loading ? "#94a3b8" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Signing in…" : "Sign In →"}
              </button>
            </div>

            {/* Mobile-only register link */}
            <p className="mobile-reg-link" style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 20, display: "none" }}>
              Not an agent? <a href="/agent" style={{ color: "#3b82f6", fontWeight: 700 }}>Register here →</a>
            </p>
          </div>
        </div>

        {/* Overlay panel — right half, clips with diagonal, slides left on .active */}
        <div className="overlay-panel" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#1d4ed8 0%,#7c3aed 60%,#4f46e5 100%)", display: "flex", alignItems: "center", paddingLeft: "52%", paddingRight: 48 }}>
          <div style={{ maxWidth: 280, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: "white", margin: "0 0 12px", lineHeight: 1.2 }}>New Here?</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: "0 0 28px", lineHeight: 1.6 }}>
              Join Elite Data as an agent. Set your own prices and earn from every data sale.
            </p>
            <button onClick={goRegister} style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 14, padding: "12px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)", transition: "background .2s" }}>
              Register as Agent →
            </button>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 20 }}>GH₵40 one-time fee · Instant approval</p>
          </div>
        </div>

      </div>

      <style>{`
        .overlay-panel {
          clip-path: polygon(44% 0, 100% 0, 100% 100%, 38% 100%);
          transition: transform 900ms cubic-bezier(.77,0,.18,1), clip-path 900ms cubic-bezier(.77,0,.18,1);
        }
        .auth-container.active .overlay-panel {
          transform: translateX(-100%);
          clip-path: polygon(0 0, 62% 0, 56% 100%, 0 100%);
        }
        .form-panel--login {
          transition: opacity 450ms ease, transform 450ms ease, filter 450ms ease;
        }
        .auth-container.active .form-panel--login {
          opacity: 0;
          transform: translateX(-60px);
          filter: blur(6px);
        }
        @media (max-width: 600px) {
          .overlay-panel { display: none !important; }
          .mobile-reg-link { display: block !important; }
          .auth-container { min-height: auto !important; border-radius: 20px !important; }
          .form-panel--login { position: relative !important; width: 100% !important; padding: 32px 24px !important; }
        }
      `}</style>
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
        callback: (response: { reference: string }) => {
          fetch("/api/agents/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, paystackRef: response.reference }) })
            .then(r => r.json())
            .then(d => { if (d.success) { onSuccess(); onClose(); } else { setError(d.error ?? "Top-up failed."); setLoading(false); } })
            .catch(() => { setError("Network error. Payment went through — contact support with your ref."); setLoading(false); });
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
        <input type="number" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 16px", color: M.text, fontSize: 22, fontWeight: 800, width: "100%", outline: "none", boxSizing: "border-box", textAlign: "center" }} value={amount} onChange={e => setAmount(e.target.value)} min={10} step={10} />
        <div style={{ display: "flex", gap: 8, margin: "14px 0 20px" }}>
          {[50, 100, 200, 500].map(v => <button key={v} onClick={() => setAmount(String(v))} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: `2px solid ${amount === String(v) ? M.blue : M.border}`, background: amount === String(v) ? "#eff6ff" : "white", color: amount === String(v) ? M.blue : M.muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{v}</button>)}
        </div>
        {error && <p style={{ color: M.red, fontSize: 13, marginBottom: 14, background: "#fee2e2", padding: "10px 12px", borderRadius: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${M.border}`, background: "transparent", color: M.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
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

  const inp: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", color: M.text, fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" };
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
              <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${M.border}`, background: "transparent", color: M.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
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

  const todayCount = data.orders.filter(o => {
    const t = new Date(o.created_at); const now = new Date();
    return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
  }).length;

  const quickActions = [
    { label: "Buy Data", icon: "📶", bg: "linear-gradient(135deg,#f59e0b,#d97706)", page: "buy_data" as Page },
    { label: "Wallet", icon: "💳", bg: "linear-gradient(135deg,#3b82f6,#2563eb)", page: "wallet" as Page },
    { label: "Reseller", icon: "🏪", bg: "linear-gradient(135deg,#f59e0b,#b45309)", page: "affiliate" as Page },
    { label: "Pro ✦", icon: "⭐", bg: "linear-gradient(135deg,#8b5cf6,#7c3aed)", page: "profile" as Page },
    { label: "Orders", icon: "📦", bg: "linear-gradient(135deg,#f97316,#ea580c)", page: "orders" as Page },
    { label: "Rewards", icon: "🎁", bg: "linear-gradient(135deg,#10b981,#059669)", page: "referrals" as Page },
  ];

  const statCards = [
    {
      label: "Wallet Balance", icon: "💳", value: `GH₵${(data.wallet_balance ?? 0).toFixed(2)}`,
      sub: null, action: <button onClick={onAddFunds} style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 10 }}>+ Deposit Funds</button>,
      iconBg: "rgba(59,130,246,0.15)",
    },
    { label: "Today's Orders", icon: "📈", value: String(todayCount), sub: `+${todayCount} today`, iconBg: "rgba(74,222,128,0.15)" },
    { label: "Total Orders", icon: "📦", value: String(data.total_sales ?? data.orders.length), sub: `${ms.count} this month`, iconBg: "rgba(249,115,22,0.15)" },
    { label: "Total Earned", icon: "💰", value: `GH₵${(data.commission_balance ?? 0).toFixed(2)}`, sub: `GH₵${ms.revenue.toFixed(2)} this month`, iconBg: "rgba(245,158,11,0.15)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <AnnouncementBanner target={isPriceMode ? "agents_custom_price" : "agents_commission"} />

      {/* Low wallet warning */}
      {(data.wallet_balance ?? 0) < 5 && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <p style={{ color: M.amber, fontWeight: 700, fontSize: 13, margin: 0 }}>⚠️ Low Wallet Balance — Your balance is below GH₵5. Top up to keep buying data.</p>
          <button onClick={onAddFunds} style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>Top Up Now</button>
        </div>
      )}

      {/* Page title */}
      <div>
        <h1 style={{ color: M.text, fontSize: 28, fontWeight: 900, margin: 0 }}>Dashboard</h1>
        <p style={{ color: M.muted, fontSize: 14, margin: "4px 0 0" }}>{greeting()}, {data.name.split(" ")[0]} 👋</p>
      </div>

      {/* Quick action circles */}
      <div style={{ display: "flex", gap: 24, overflowX: "auto", paddingBottom: 4 }}>
        {quickActions.map(qa => (
          <button key={qa.label} onClick={() => onNavigate(qa.page)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: qa.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 4px 14px rgba(0,0,0,0.12)", transition: "transform 0.15s" }}>
              {qa.icon}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: M.muted, whiteSpace: "nowrap" }}>{qa.label}</span>
          </button>
        ))}
      </div>

      {/* 4 stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="stat-grid">
        {statCards.map((c, i) => (
          <div key={i} style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, padding: "20px 20px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: M.muted, fontWeight: 600, margin: 0 }}>{c.label}</p>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: c.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{c.icon}</div>
            </div>
            <p style={{ fontSize: 26, fontWeight: 900, color: M.text, margin: 0, lineHeight: 1 }}>{c.value}</p>
            {c.action ?? (c.sub && <p style={{ fontSize: 12, color: M.muted, margin: "8px 0 0" }}>{c.sub}</p>)}
          </div>
        ))}
      </div>

      {/* Recent Orders + Wallet Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="main-grid">
        {/* Recent Orders */}
        <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Recent Orders</p>
            <button onClick={() => onNavigate("orders")} style={{ background: "none", border: "none", color: M.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View all orders →</button>
          </div>
          {data.orders.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: M.muted, fontSize: 13 }}>No recent orders</div>
          ) : (
            data.orders.slice(0, 6).map((o, i) => {
              const nb = netBadge(o.network); const sb = statusBadge(o.status);
              const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel|vodafone)\s+/i, "").trim();
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < Math.min(data.orders.length, 6) - 1 ? `1px solid ${M.border}` : "none" }}>
                  <span style={{ background: nb.bg, color: nb.color, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{nb.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: M.text, fontWeight: 700, fontSize: 13, margin: 0 }}>{cleanSize} → {(o.phone ?? "").slice(0, 3)}****{(o.phone ?? "").slice(-3)}</p>
                    <p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontWeight: 800, color: M.text, fontSize: 13, margin: 0 }}>GH₵{Number(o.amount).toFixed(2)}</p>
                    <span style={{ background: sb.bg, color: sb.color, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{sb.label}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Wallet + Earnings summary */}
        <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Wallet & Earnings</p>
            <button onClick={() => onNavigate("wallet")} style={{ background: "none", border: "none", color: M.blue, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View wallet →</button>
          </div>
          <div style={{ padding: "20px" }}>
            <div style={{ background: "linear-gradient(135deg,#0d1b2e,#1e3a5f)", borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 4px" }}>Wallet Balance</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: "#4ade80", margin: "0 0 12px", lineHeight: 1 }}>GH₵{(data.wallet_balance ?? 0).toFixed(2)}</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Main wallet · for purchases</p>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button onClick={onAddFunds} style={{ flex: 1, background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Deposit Funds</button>
              <button onClick={onWithdraw} style={{ flex: 1, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: M.green, borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Withdraw</button>
            </div>
            {[
              { label: "Total Earnings", value: `GH₵${(data.commission_balance ?? 0).toFixed(2)}` },
              { label: "This Month", value: `GH₵${ms.revenue.toFixed(2)}` },
              { label: "Agent Level", value: `${tier.icon} ${tier.name}` },
              { label: "Success Rate", value: `${successRate}%` },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${M.border}` }}>
                <span style={{ fontSize: 13, color: M.muted }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: M.text }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sales chart */}
      <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${M.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontWeight: 800, color: M.text, fontSize: 15, margin: 0 }}>Sales Overview · Last 30 Days</p>
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "Daily Avg", value: `GH₵${dailyAvg.toFixed(2)}` },
              { label: "Best Day", value: bestDay.revenue > 0 ? `GH₵${bestDay.revenue.toFixed(2)}` : "—" },
              { label: "Total", value: `GH₵${ms.revenue.toFixed(2)}` },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "right" }}>
                <p style={{ fontSize: 10, color: M.muted, margin: 0, fontWeight: 600 }}>{s.label}</p>
                <p style={{ fontSize: 13, fontWeight: 800, color: M.text, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <SalesChart data={daily} />
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
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${M.border}` }}>
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
                  <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${M.border}` }}>
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
            <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${M.border}` }}>
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

  const isPriceModeAgent = data.agent_type === "custom_price";
  const paystackBal = data.paystack_wallet_balance ?? 0;
  const commissionBal = data.commission_balance ?? 0;
  const withdrawable = isPriceModeAgent ? commissionBal + paystackBal : commissionBal;

  const whole = Math.floor(data.wallet_balance ?? 0);
  const frac  = ((data.wallet_balance ?? 0) % 1).toFixed(2).slice(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Wallet</h2>

      {/* ─── Hero Wallet Card ─── */}
      <div style={{
        borderRadius: 22, padding: "22px 22px 20px",
        border: "1px solid rgba(74,222,128,0.28)",
        background: "radial-gradient(120% 90% at 18% 0%, #0d2518 0%, #0d1b2e 55%, #080f1e 100%)",
        boxShadow: "0 0 0 1px rgba(74,222,128,0.1), 0 18px 50px -14px rgba(74,222,128,0.22)",
        position: "relative", overflow: "hidden",
      }}>
        {/* sheen */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 40% at 80% 100%, rgba(255,255,255,0.03), transparent 70%)", pointerEvents: "none" }} />

        {/* head */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(248,250,252,0.55)" }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,0.22)" }} />
            Working Capital
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 10px 0 8px", borderRadius: 999, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.22)", color: "#4ade80", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse 2s infinite" }} />
            LIVE
          </div>
        </div>

        {/* big value */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, lineHeight: 0.95, letterSpacing: "-0.035em", position: "relative" }}>
          <span style={{ fontSize: "1.75rem", marginRight: 2, opacity: 0.65, color: "#f8fafc", fontWeight: 600 }}>GH₵</span>
          <span style={{ fontSize: "3.25rem", fontWeight: 700, color: "#4ade80" }}>{whole}</span>
          <span style={{ fontSize: "1.5rem", fontWeight: 600, opacity: 0.5, color: "#4ade80" }}>{frac}</span>
        </div>

        <p style={{ margin: "12px 0 22px", fontSize: 12, color: "rgba(248,250,252,0.5)", letterSpacing: "0.02em", position: "relative" }}>
          Active working capital · use this to buy data bundles
        </p>

        {/* foot */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onAddFunds} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 18px", borderRadius: 999, background: "#4ade80", color: "#080f1e", border: 0, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "opacity .15s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Funds
            </button>
            <button onClick={onWithdraw} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 18px", borderRadius: 999, background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "opacity .15s" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              Withdraw
            </button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.04em", color: "rgba(248,250,252,0.35)", textAlign: "right", lineHeight: 1.5 }}>
            {data.name.split(" ")[0].toUpperCase()}<br />
            {data.referral_code}
          </div>
        </div>
      </div>

      {isPriceModeAgent ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="wallet-grid">
          {/* Working Capital */}
          <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: "20px" }}>
            <p style={{ fontSize: 12, color: M.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 8px" }}>Working Capital</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: M.blue, margin: "0 0 4px", lineHeight: 1 }}>GH₵{(data.wallet_balance ?? 0).toFixed(2)}</p>
            <p style={{ fontSize: 12, color: M.muted, margin: "0 0 4px" }}>For buying data bundles</p>
            <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: M.muted, margin: "0 0 2px" }}>Paystack deposits: <b style={{ color: M.blue }}>GH₵{paystackBal.toFixed(2)}</b> <span style={{ color: "#94a3b8" }}>(withdrawable)</span></p>
              <p style={{ fontSize: 11, color: M.muted, margin: 0 }}>Admin credited: <b style={{ color: M.muted }}>GH₵{Math.max(0, (data.wallet_balance ?? 0) - paystackBal).toFixed(2)}</b> <span style={{ color: "#94a3b8" }}>(buying power only)</span></p>
            </div>
            <button onClick={onAddFunds} style={{ width: "100%", background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Add Funds</button>
          </div>
          {/* Withdrawable */}
          <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: "20px" }}>
            <p style={{ fontSize: 12, color: M.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 8px" }}>Withdrawable</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: "#16a34a", margin: "0 0 4px", lineHeight: 1 }}>GH₵{withdrawable.toFixed(2)}</p>
            <p style={{ fontSize: 12, color: M.muted, margin: "0 0 4px" }}>Available to withdraw now</p>
            <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: M.muted, margin: "0 0 2px" }}>Profit from sales: <b style={{ color: "#16a34a" }}>GH₵{commissionBal.toFixed(2)}</b></p>
              <p style={{ fontSize: 11, color: M.muted, margin: 0 }}>Paystack deposits: <b style={{ color: "#16a34a" }}>GH₵{paystackBal.toFixed(2)}</b></p>
            </div>
            <button onClick={onWithdraw} style={{ width: "100%", background: "linear-gradient(90deg,#16a34a,#15803d)", color: "white", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Withdraw</button>
          </div>
        </div>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }} className="wallet-grid">
        {[
          { label: "Working Capital", value: `GH₵${(data.wallet_balance ?? 0).toFixed(2)}`, sub: "For buying data", color: M.blue, action: onAddFunds, btnLabel: "+ Add Funds", btnStyle: "blue" },
          { label: "Earnings Balance", value: `GH₵${commissionBal.toFixed(2)}`, sub: "Available to withdraw", color: "#16a34a", action: onWithdraw, btnLabel: "Withdraw", btnStyle: "green" },
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
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[{ label: "Total Deposited", value: `GH₵${totalDep.toFixed(2)}`, color: "#16a34a", icon: "↓" }, { label: "Total Withdrawn", value: `GH₵${totalWith.toFixed(2)}`, color: M.red, icon: "↑" }].map(r => (
          <div key={r.label} style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: r.color === "#16a34a" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: r.color }}>{r.icon}</div>
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
  const [agentPlan, setAgentPlan] = useState<"free" | "pro" | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/bundles").then(r => r.json()), fetch(`/api/agent-tier-prices?agentCode=${data.referral_code}`).then(r => r.json()), fetch(`/api/agents/prices?agentId=${data.id}`).then(r => r.json())]).then(([b, tier, agent]) => {
      setDbBundles(b.bundles ?? []);
      setAgentPlan(tier.plan ?? null);
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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: "0 0 4px" }}>My Selling Prices</h2>
          <p style={{ color: M.muted, fontSize: 13, margin: 0 }}>You control what your customers pay. Set any price above your buy price — that gap is your profit.</p>
        </div>
        {agentPlan && (
          <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0,
            background: agentPlan === "free" ? "rgba(59,130,246,0.12)" : "rgba(139,92,246,0.12)",
            color: agentPlan === "free" ? "#3b82f6" : "#7c3aed",
            border: `1px solid ${agentPlan === "free" ? "rgba(59,130,246,0.3)" : "rgba(139,92,246,0.3)"}` }}>
            {agentPlan === "free" ? "Free Agent" : "Pro Agent ⭐"}
          </span>
        )}
      </div>

      {/* How it works banner */}
      <div style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
        <div>
          <p style={{ color: M.text, fontSize: 13, fontWeight: 700, margin: "0 0 2px" }}>How your pricing works</p>
          <p style={{ color: M.muted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
            <b style={{ color: M.blue }}>Your Buy Price</b> is what you pay per bundle. Set your <b style={{ color: "#16a34a" }}>My Selling Price</b> to anything higher — the difference goes straight to you as profit. No limits.
          </p>
        </div>
      </div>

      {msg && <div style={{ padding: "12px 16px", borderRadius: 12, background: msg.ok ? "#dcfce7" : "#fee2e2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, color: msg.ok ? "#16a34a" : M.red, fontSize: 14, fontWeight: 700 }}>{msg.text}</div>}

      {/* Network tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {nets.map(n => (
          <button key={n.id} onClick={() => setActiveNet(n.id)} style={{ padding: "8px 20px", borderRadius: 10, border: `2px solid ${activeNet === n.id ? netColor[n.id] : M.border}`, background: activeNet === n.id ? `${netColor[n.id]}15` : "transparent", color: activeNet === n.id ? netColor[n.id] : M.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>{n.label}</button>
        ))}
      </div>

      {/* Price table */}
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 150px 150px", gap: 0, padding: "10px 20px", borderBottom: `1px solid ${M.border}`, background: "rgba(255,255,255,0.04)" }}>
          {[
            { label: "Bundle", color: M.muted },
            { label: "Your Buy Price", color: M.blue },
            { label: "My Selling Price", color: "#16a34a" },
            { label: "Your Profit", color: M.amber },
          ].map(h => (
            <p key={h.label} style={{ color: h.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>{h.label}</p>
          ))}
        </div>

        {/* Rows */}
        {filtered.map((b, i) => {
          const base     = tierPrices[b.id] ?? b.costPrice;
          const myPrice  = agentPrices[b.id];
          const profit   = myPrice != null ? myPrice - base : null;
          const isEditing = editing?.bundleId === b.id;
          return (
            <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 150px 150px", gap: 0, padding: "14px 20px", borderTop: i > 0 ? `1px solid ${M.border}` : "none", alignItems: "center" }}>
              {/* Bundle name */}
              <div>
                <p style={{ color: M.text, fontWeight: 700, fontSize: 14, margin: "0 0 2px" }}>{b.size}</p>
                <p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{b.validity}</p>
              </div>

              {/* Buy price (read-only, what agent pays) */}
              <div>
                <p style={{ color: M.blue, fontWeight: 700, fontSize: 14, margin: 0 }}>GH₵{base.toFixed(2)}</p>
                <p style={{ color: M.muted, fontSize: 10, margin: "2px 0 0" }}>your cost</p>
              </div>

              {/* Selling price (agent sets this) */}
              <div>
                {isEditing ? (
                  <input
                    type="number" step="0.5" autoFocus value={editing.val}
                    onChange={e => setEditing(p => p ? { ...p, val: e.target.value } : p)}
                    style={{ background: "rgba(255,255,255,0.05)", border: `2px solid ${M.blue}`, borderRadius: 8, padding: "7px 10px", color: M.text, fontSize: 14, width: 110, outline: "none" }}
                    onKeyDown={e => { if (e.key === "Enter") savePrice(b.id, parseFloat(editing.val)); if (e.key === "Escape") setEditing(null); }}
                  />
                ) : (
                  <button onClick={() => setEditing({ bundleId: b.id, val: String(myPrice ?? (base + 1).toFixed(2)) })} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: myPrice ? "#16a34a" : M.muted, margin: 0 }}>{myPrice ? `GH₵${myPrice.toFixed(2)}` : "Tap to set →"}</p>
                    {!myPrice && <p style={{ fontSize: 10, color: M.muted, margin: "2px 0 0" }}>not set yet</p>}
                  </button>
                )}
              </div>

              {/* Profit + actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {profit !== null && profit > 0 && (
                  <span style={{ fontSize: 12, color: "#16a34a", background: "#dcfce7", padding: "3px 8px", borderRadius: 20, fontWeight: 700 }}>+GH₵{profit.toFixed(2)}</span>
                )}
                {profit !== null && profit <= 0 && (
                  <span style={{ fontSize: 12, color: M.red, background: "#fee2e2", padding: "3px 8px", borderRadius: 20, fontWeight: 700 }}>Below cost!</span>
                )}
                {isEditing ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => savePrice(b.id, parseFloat(editing.val))} disabled={saving} style={{ background: M.blue, color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                    <button onClick={() => setEditing(null)} style={{ background: "#f1f5f9", color: M.muted, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setEditing({ bundleId: b.id, val: String(myPrice ?? (base + 1).toFixed(2)) })} style={{ background: "#f1f5f9", border: `1px solid ${M.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, color: M.muted, cursor: "pointer", fontWeight: 600 }}>Edit</button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: M.muted }}>No bundles for {activeNet}.</div>}
      </div>

      {/* Quick tip */}
      <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "12px 16px" }}>
        <p style={{ color: "#16a34a", fontSize: 12, fontWeight: 700, margin: "0 0 2px" }}>💰 Tip: set competitive prices</p>
        <p style={{ color: M.muted, fontSize: 12, margin: 0 }}>Your customers only see <b style={{ color: M.text }}>My Selling Price</b> — they never see your buy price. The higher you sell vs. what you pay, the more you earn per sale.</p>
      </div>
    </div>
  );
}

// ─── Place Order Page ─────────────────────────────────────────────────────────
function PlaceOrderPage({ data, onRefresh }: { data: AgentData; onRefresh: () => void }) {
  const [mode, setMode] = useState<"wallet" | "manual">("wallet");
  const [activeNet, setActiveNet] = useState<"mtn" | "telecel" | "airteltigo">("mtn");
  const [dbBundles, setDbBundles] = useState<BundleItem[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<BundleItem | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<ManualOrder[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(data.wallet_balance ?? 0);

  useEffect(() => {
    Promise.all([
      fetch("/api/bundles").then(r => r.json()),
      fetch(`/api/agent-tier-prices?agentCode=${data.referral_code}`).then(r => r.json()),
    ]).then(([b, tier]) => {
      setDbBundles(b.bundles ?? []);
      const tm: Record<string, number> = {};
      for (const p of (tier.prices ?? [])) tm[p.bundle_id] = Number(p.price);
      setTierPrices(tm);
    });
    fetch(`/api/agents/manual-order?agentId=${data.id}`).then(r => r.json()).then(d => { setHistory(d.orders ?? []); setHistLoading(false); }).catch(() => setHistLoading(false));
  }, [data.id]);

  async function submitWalletOrder() {
    const cleaned = phone.replace(/\s/g, "");
    if (!selected) { setMsg({ text: "Select a bundle first.", ok: false }); return; }
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setMsg({ text: "Enter a valid Ghana phone number (e.g. 0241234567).", ok: false }); return; }
    const cost = tierPrices[selected.id] ?? selected.costPrice;
    if (walletBalance < cost) {
      setMsg({ text: `Insufficient wallet balance. Need GH₵${cost.toFixed(2)}, you have GH₵${walletBalance.toFixed(2)}.`, ok: false });
      return;
    }
    setLoading(true); setMsg(null);
    try {
      const res = await fetch("/api/agents/wallet-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: data.id,
          referralCode: data.referral_code,
          phone: cleaned,
          bundleId: selected.id,
          network: selected.network,
          bundleSize: selected.size,
          sizeGB: selected.sizeGB,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setWalletBalance(d.newWalletBalance ?? walletBalance - cost);
        setMsg({ text: d.pending ? `⏳ Order sent for ${cleaned}. Delivery within 1–5 minutes.` : `✅ ${selected.network.toUpperCase()} ${selected.size} delivered to ${cleaned}!`, ok: true });
        setPhone(""); setSelected(null);
        onRefresh();
      } else {
        setMsg({ text: d.error ?? "Order failed. Try again.", ok: false });
      }
    } catch { setMsg({ text: "Network error. Try again.", ok: false }); }
    finally { setLoading(false); }
  }

  async function submitManualOrder() {
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
  const selectedCost = selected ? (tierPrices[selected.id] ?? selected.costPrice) : 0;
  const canAfford = walletBalance >= selectedCost;

  const isWallet = mode === "wallet";
  const submitFn = isWallet ? submitWalletOrder : submitManualOrder;
  const btnDisabled = loading || !selected || (isWallet && !canAfford && !!selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>Place Order</h2>
          <p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>{isWallet ? "Instant delivery from your wallet balance." : "Submit to admin — they'll fulfill and credit your commission."}</p>
        </div>
        {/* Mode toggle */}
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 12, padding: 4, gap: 4 }}>
          <button onClick={() => { setMode("wallet"); setMsg(null); }} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: isWallet ? "white" : "transparent", color: isWallet ? M.blue : M.muted, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: isWallet ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>⚡ Wallet</button>
          <button onClick={() => { setMode("manual"); setMsg(null); }} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: !isWallet ? "white" : "transparent", color: !isWallet ? M.text : M.muted, fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: !isWallet ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>Manual</button>
        </div>
      </div>

      {/* Wallet balance banner */}
      {isWallet && (
        <div style={{ background: walletBalance > 0 ? "#f0fdf4" : "#fef9c3", border: `1px solid ${walletBalance > 0 ? "#bbf7d0" : "#fef08a"}`, borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ color: M.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 2px" }}>Wallet Balance</p>
            <p style={{ color: walletBalance > 0 ? "#16a34a" : "#92400e", fontWeight: 900, fontSize: 22, margin: 0 }}>GH₵{walletBalance.toFixed(2)}</p>
          </div>
          {walletBalance <= 5 && (
            <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#92400e", fontWeight: 700 }}>
              Low balance — top up to place orders
            </div>
          )}
        </div>
      )}

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
              const cost = tierPrices[b.id] ?? b.costPrice;
              const affordable = walletBalance >= cost;
              return (
                <button key={b.id} onClick={() => setSelected(b)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: i > 0 ? `1px solid ${M.border}` : "none", background: isSel ? "#eff6ff" : "transparent", border: "none", cursor: "pointer", textAlign: "left", opacity: isWallet && !affordable ? 0.5 : 1 }}>
                  <div>
                    <p style={{ fontWeight: 800, color: isSel ? M.blue : M.text, fontSize: 15, margin: 0 }}>{b.size}</p>
                    <p style={{ color: M.muted, fontSize: 12, margin: "2px 0 0" }}>{b.validity}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {isWallet ? (
                      <>
                        <p style={{ fontWeight: 900, color: isSel ? M.blue : M.text, fontSize: 16, margin: 0 }}>GH₵{cost.toFixed(2)}</p>
                        <p style={{ color: M.muted, fontSize: 10, margin: 0 }}>from wallet</p>
                      </>
                    ) : (
                      <p style={{ fontWeight: 900, color: isSel ? M.blue : M.text, fontSize: 16, margin: 0 }}>GH₵{b.price.toFixed(2)}</p>
                    )}
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
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: `2px solid ${M.blue}` }}>
                <p style={{ color: M.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", margin: "0 0 4px" }}>Selected Bundle</p>
                <p style={{ color: M.text, fontWeight: 900, fontSize: 18, margin: "0 0 2px" }}>{selected.size} — {selected.network.toUpperCase()}</p>
                <p style={{ color: M.muted, fontSize: 12, margin: 0 }}>
                  {selected.validity} ·{" "}
                  {isWallet
                    ? <span>Cost: <strong style={{ color: M.blue }}>GH₵{selectedCost.toFixed(2)}</strong></span>
                    : <span>GH₵{selected.price.toFixed(2)}</span>
                  }
                </p>
                {isWallet && !canAfford && (
                  <p style={{ color: M.red, fontSize: 12, fontWeight: 700, margin: "6px 0 0" }}>⚠ Insufficient wallet balance</p>
                )}
              </div>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center", color: M.muted, fontSize: 13 }}>← Pick a bundle from the list</div>
            )}
            <p style={{ fontSize: 12, color: M.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 6px" }}>{isWallet ? "Recipient Phone Number" : "Customer Phone Number"}</p>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0241234567" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${M.border}`, borderRadius: 10, padding: "11px 14px", color: M.text, fontSize: 16, fontWeight: 700, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 16 }} />
            {msg && <div style={{ padding: "10px 14px", borderRadius: 10, background: msg.ok ? "#dcfce7" : "#fee2e2", color: msg.ok ? "#16a34a" : M.red, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{msg.text}</div>}
            <button onClick={submitFn} disabled={btnDisabled} style={{ width: "100%", background: btnDisabled ? "#94a3b8" : isWallet ? "linear-gradient(90deg,#16a34a,#15803d)" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 800, cursor: btnDisabled ? "not-allowed" : "pointer" }}>
              {loading
                ? (isWallet ? "Sending…" : "Placing Order…")
                : selected
                  ? isWallet
                    ? `⚡ Pay GH₵${selectedCost.toFixed(2)} from Wallet`
                    : `Place Order · GH₵${selected.price.toFixed(2)}`
                  : "Select a Bundle"}
            </button>
            <p style={{ color: M.muted, fontSize: 11, textAlign: "center", margin: "10px 0 0" }}>
              {isWallet ? "Data delivered instantly. Deducted from your wallet." : "Admin will fulfill within minutes. Commission credited on completion."}
            </p>
          </div>

          {/* Recent manual orders */}
          {!isWallet && (
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
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Referrals / Store Page ───────────────────────────────────────────────────
function ReferralsPage({ data }: { data: AgentData }) {
  const [copied, setCopied] = useState(false);
  const [reward, setReward] = useState<{
    todaySales: number; threshold: number; rewardEarned: boolean;
    claimed: boolean; rewardBundle: { label: string; price: number } | null;
    history: { claim_date: string; bundle_label: string; credit_amount: number }[];
  } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sqlNeeded, setSqlNeeded] = useState("");

  const storeUrl = typeof window !== "undefined" ? `${window.location.origin}/shop/${data.referral_code}` : `/shop/${data.referral_code}`;
  function copyLink() { navigator.clipboard.writeText(storeUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }

  useEffect(() => {
    fetch(`/api/agents/daily-reward?agentId=${data.id}`)
      .then(r => r.json())
      .then(d => setReward(d))
      .catch(() => null);
  }, [data.id]);

  async function claimReward() {
    setClaiming(true); setClaimMsg(null); setSqlNeeded("");
    const res  = await fetch("/api/agents/daily-reward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: data.id }),
    });
    const d = await res.json();
    setClaiming(false);
    if (d.success) {
      setClaimMsg({ text: `🎉 Reward claimed! GH₵${d.credited} (${d.bundle}) added to your wallet.`, ok: true });
      setReward(r => r ? { ...r, claimed: true } : r);
    } else if (d.sqlNeeded) {
      setSqlNeeded(d.sql);
      setClaimMsg({ text: d.error, ok: false });
    } else {
      setClaimMsg({ text: d.error || "Claim failed.", ok: false });
    }
  }

  const pct = reward ? Math.min(100, (reward.todaySales / reward.threshold) * 100) : 0;
  const remaining = reward ? Math.max(0, reward.threshold - reward.todaySales) : 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      <div>
        <h2 style={{ color: M.text, fontSize: 18, fontWeight: 900, margin: 0 }}>🎁 Daily Rewards</h2>
        <p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Sell 10+ bundles in a day — earn a free data bundle (3GB+) as a reward!</p>
      </div>

      {/* ── Daily progress card ── */}
      <div style={{ background: M.card, borderRadius: 20, border: `1px solid ${M.border}`, padding: 24, position: "relative", overflow: "hidden" }}>
        {/* Glow when earned */}
        {reward?.rewardEarned && !reward.claimed && (
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ color: M.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, margin: "0 0 4px" }}>Today&apos;s Progress</p>
            <p style={{ color: M.text, fontSize: 28, fontWeight: 900, margin: 0 }}>
              {reward?.todaySales ?? "—"} <span style={{ color: M.muted, fontSize: 16, fontWeight: 600 }}>/ 10 sales</span>
            </p>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: reward?.rewardEarned ? "linear-gradient(135deg,#16a34a,#4ade80)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: reward?.rewardEarned ? "0 0 20px rgba(74,222,128,0.4)" : "none", transition: "all 0.4s" }}>
            {reward?.rewardEarned ? "🎁" : "📦"}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: reward?.rewardEarned ? "linear-gradient(90deg,#16a34a,#4ade80)" : "linear-gradient(90deg,#3b82f6,#7c3aed)", transition: "width 0.7s cubic-bezier(.4,0,.2,1)" }} />
        </div>
        <p style={{ color: M.muted, fontSize: 12, margin: "0 0 18px" }}>
          {reward?.rewardEarned
            ? reward.claimed ? "✅ Reward claimed today — keep selling! Resets at midnight." : "🔥 You've hit 10 sales! Claim your free bundle below."
            : `${remaining} more sale${remaining !== 1 ? "s" : ""} to earn today's free bundle`}
        </p>

        {/* Claim button */}
        {reward?.rewardEarned && !reward.claimed && (
          <button
            onClick={claimReward}
            disabled={claiming}
            style={{ width: "100%", background: claiming ? "#475569" : "linear-gradient(90deg,#16a34a,#22c55e)", color: "white", border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 900, cursor: claiming ? "not-allowed" : "pointer", boxShadow: "0 6px 24px rgba(74,222,128,0.35)", letterSpacing: 0.3 }}
          >
            {claiming ? "Claiming…" : `🎁 Claim Free ${reward.rewardBundle?.label ?? "3GB+"} Bundle → GH₵${reward.rewardBundle?.price?.toFixed(2) ?? "0.00"} wallet credit`}
          </button>
        )}

        {reward?.rewardEarned && reward.claimed && (
          <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
            <p style={{ color: "#4ade80", fontWeight: 800, fontSize: 14, margin: 0 }}>✅ Reward earned and claimed today!</p>
            <p style={{ color: M.muted, fontSize: 12, margin: "4px 0 0" }}>Resets at midnight — keep selling tomorrow for another reward.</p>
          </div>
        )}

        {claimMsg && (
          <div style={{ marginTop: 12, background: claimMsg.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${claimMsg.ok ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 10, padding: "10px 14px" }}>
            <p style={{ color: claimMsg.ok ? "#4ade80" : M.red, fontWeight: 700, fontSize: 13, margin: 0 }}>{claimMsg.text}</p>
          </div>
        )}

        {sqlNeeded && (
          <div style={{ marginTop: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: 14 }}>
            <p style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, margin: "0 0 6px" }}>Run this SQL in Supabase → SQL Editor:</p>
            <pre style={{ color: "#4ade80", fontSize: 11, background: "#0e1928", borderRadius: 8, padding: 10, overflowX: "auto", margin: 0, whiteSpace: "pre-wrap" }}>{sqlNeeded}</pre>
          </div>
        )}
      </div>

      {/* ── How it works ── */}
      <div style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 16, padding: 18 }}>
        <p style={{ color: M.blue, fontWeight: 800, fontSize: 13, margin: "0 0 10px" }}>💡 How the daily reward works</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { n: "1", text: "Sell 10 or more data bundles in a single day" },
            { n: "2", text: 'Come to this page and click "Claim" before midnight' },
            { n: "3", text: "A free bundle (3GB+) is credited to your wallet instantly" },
            { n: "4", text: "Use the credit to buy your next bundle for a customer — or keep it!" },
          ].map(s => (
            <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: M.blue, color: "white", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
              <p style={{ color: M.muted, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reward history ── */}
      {reward?.history && reward.history.length > 0 && (
        <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${M.border}` }}>
            <p style={{ color: M.text, fontWeight: 800, fontSize: 14, margin: 0 }}>Recent Rewards</p>
          </div>
          {reward.history.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: i < reward.history.length - 1 ? `1px solid ${M.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🎁</span>
                <div>
                  <p style={{ color: M.text, fontWeight: 700, fontSize: 13, margin: 0 }}>{h.bundle_label} bundle</p>
                  <p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{h.claim_date}</p>
                </div>
              </div>
              <p style={{ color: "#4ade80", fontWeight: 800, fontSize: 14, margin: 0 }}>+GH₵{Number(h.credit_amount).toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Store link ── */}
      <div style={{ background: M.card, borderRadius: 16, border: `1px solid ${M.border}`, padding: 20 }}>
        <p style={{ color: M.text, fontWeight: 800, fontSize: 14, margin: "0 0 12px" }}>📎 My Store Link</p>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, border: `1px solid ${M.border}`, marginBottom: 10 }}>
          <p style={{ color: M.muted, fontSize: 12, margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>{storeUrl}</p>
          <button onClick={copyLink} style={{ background: copied ? "#16a34a" : M.blue, color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
        <button onClick={() => window.open(storeUrl, "_blank")} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${M.border}`, color: M.muted, borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Open My Store ↗</button>
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
      <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: M.muted, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Your API Key</p>
        <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${M.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
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
      <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
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
          <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${M.border}`, borderRadius: 12, padding: "14px 16px" }}>
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
      <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: M.text, margin: "0 0 8px" }}>Get available bundles &amp; prices</p>
        <p style={{ fontSize: 13, color: M.muted, margin: "0 0 12px" }}>Returns all active bundles with network, size and price. No authentication needed.</p>
        <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <code style={{ fontSize: 12, color: "#7dd3fc" }}>GET {siteUrl}/api/v1/bundles</code>
          <button onClick={() => copy(`${siteUrl}/api/v1/bundles`, "bundles")} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>
            {copied === "bundles" ? "✅" : "Copy"}
          </button>
        </div>
      </div>

      {/* Check wallet balance */}
      <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: M.text, margin: "0 0 8px" }}>Check your wallet balance</p>
        <p style={{ fontSize: 13, color: M.muted, margin: "0 0 12px" }}>Returns your current API wallet balance and recent transactions.</p>
        <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <code style={{ fontSize: 12, color: "#7dd3fc" }}>GET {siteUrl}/api/v1/balance</code>
          <button onClick={() => copy(`${siteUrl}/api/v1/balance`, "balance")} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>
            {copied === "balance" ? "✅" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: M.muted, margin: "10px 0 0" }}>Requires <code>Authorization: Bearer YOUR_API_KEY</code> header.</p>
      </div>

      {/* Check order status */}
      <div style={{ background: M.card, border: `1px solid ${M.border}`, borderRadius: 16, padding: "20px 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: M.text, margin: "0 0 8px" }}>Check order delivery status</p>
        <p style={{ fontSize: 13, color: M.muted, margin: "0 0 12px" }}>Check the delivery status of any order using its reference.</p>
        <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <code style={{ fontSize: 12, color: "#7dd3fc" }}>GET {siteUrl}/api/v1/orders/YOUR-REF</code>
          <button onClick={() => copy(`${siteUrl}/api/v1/orders/YOUR-REF`, "orderstatus")} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>
            {copied === "orderstatus" ? "✅" : "Copy"}
          </button>
        </div>
        <div style={{ background: "#0f172a", borderRadius: 12, padding: "14px 16px", marginTop: 8 }}>
          <pre style={{ fontSize: 12, color: "#86efac", margin: 0, fontFamily: "monospace" }}>{`{
  "success": true,
  "reference": "YOUR-REF",
  "status": "completed",
  "network": "MTN",
  "phone": "0241234567",
  "bundle_size": "1GB"
}`}</pre>
        </div>
        <p style={{ fontSize: 12, color: M.muted, margin: "10px 0 0" }}>Requires <code>Authorization: Bearer YOUR_API_KEY</code> header. Status: <code>pending</code> / <code>processing</code> / <code>completed</code> / <code>failed</code></p>
      </div>

    </div>
  );
}

// ─── Affiliate Page (Referrals + Leaderboard combined) ───────────────────────
function AffiliatePage({ data }: { data: AgentData }) {
  const [tab, setTab] = useState<"how" | "store" | "sales">("how");
  const [storeName, setStoreName] = useState(data.business_name ?? "");
  const [whatsapp, setWhatsapp] = useState(data.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState("");

  const totalEarned = (data.commission_balance ?? 0) + (data.paystack_wallet_balance ?? 0);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://elitedata1.com";
  const storeLink = `${siteUrl}/store/${data.referral_code}`;
  const isActive = data.referral_code && (data.total_sales ?? 0) > 0;
  const minWithdraw = 30;

  async function saveProfile() {
    setSaving(true); setSaveMsg("");
    try {
      const res = await fetch("/api/agents/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: data.id, business_name: storeName, phone: whatsapp }) });
      setSaveMsg(res.ok ? "Saved!" : "Failed to save");
    } catch { setSaveMsg("Failed"); }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  }

  async function requestWithdraw() {
    if (totalEarned < minWithdraw) { setWithdrawMsg(`You need at least GH₵${minWithdraw} to withdraw.`); return; }
    setWithdrawing(true); setWithdrawMsg("");
    try {
      const res = await fetch("/api/agents/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: data.id, amount: totalEarned }) });
      const j = await res.json();
      setWithdrawMsg(j.message ?? (res.ok ? "Withdrawal request sent!" : "Failed"));
    } catch { setWithdrawMsg("Failed to submit request."); }
    setWithdrawing(false);
  }

  const GOLD = "#f59e0b";
  const tabStyle = (t: typeof tab) => ({
    padding: "10px 18px", borderRadius: 12, border: "none",
    background: tab === t ? GOLD : "rgba(255,255,255,0.06)",
    color: tab === t ? "#000" : M.muted,
    fontSize: 13, fontWeight: 700, cursor: "pointer" as const,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ color: M.text, fontSize: 26, fontWeight: 900, margin: 0 }}>Reseller Program</h1>
        <p style={{ color: M.muted, fontSize: 13, margin: "4px 0 0" }}>Buy at wholesale prices. Set your profit. Share your store. Earn automatically.</p>
      </div>

      {/* Status card */}
      <div style={{ background: isActive ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${isActive ? "rgba(245,158,11,0.3)" : M.border}`, borderRadius: 18, padding: "24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: isActive ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
            {isActive ? "✅" : "🏪"}
          </div>
          <div>
            <p style={{ color: M.text, fontWeight: 800, fontSize: 16, margin: 0 }}>{isActive ? "Active Reseller ✓" : "Join Reseller Program"}</p>
            <p style={{ color: M.muted, fontSize: 12, margin: "2px 0 0" }}>{isActive ? "Your store is live. Share your link and earn automatically on every sale." : "Apply to get your own store link and earn on every sale."}</p>
          </div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: "14px 18px" }}>
          <p style={{ color: M.muted, fontSize: 12, margin: "0 0 2px" }}>Total Earned</p>
          <p style={{ color: GOLD, fontWeight: 900, fontSize: 26, margin: 0 }}>GH₵ {totalEarned.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
        <button style={tabStyle("how")} onClick={() => setTab("how")}>How It Works</button>
        <button style={tabStyle("store")} onClick={() => setTab("store")}>My Store & Prices</button>
        <button style={tabStyle("sales")} onClick={() => setTab("sales")}>Sales Report</button>
      </div>

      {/* How It Works tab */}
      {tab === "how" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { n: 1, title: "Set Your Prices", desc: "Go to \"My Store & Prices\" tab → set your selling price for each bundle (must be above your cost) → toggle ON to add to store." },
            { n: 2, title: "Share Your Store Link", desc: "Copy your unique store link and share it on WhatsApp, Facebook, or send directly to customers." },
            { n: 3, title: "Customer Pays via MoMo", desc: "Customer visits your link, selects a bundle, enters their phone, and pays with Mobile Money through Paystack — fully automated." },
            { n: 4, title: "Profit Auto-Credited", desc: "As soon as payment is confirmed, data is delivered to the customer and your profit lands in your Reseller Earnings instantly." },
          ].map(s => (
            <div key={s.n} style={{ background: M.card, borderRadius: 14, border: `1px solid ${M.border}`, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, color: "#000", flexShrink: 0 }}>{s.n}</div>
              <div>
                <p style={{ color: M.text, fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>{s.title}</p>
                <p style={{ color: M.muted, fontSize: 13, margin: 0 }}>{s.desc}</p>
              </div>
            </div>
          ))}
          {/* Example box */}
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, padding: "16px 18px" }}>
            <p style={{ color: M.text, fontSize: 13, margin: 0 }}>💡 <strong>Example:</strong> You get <strong>5GB MTN for GH₵ 10</strong>. You set your price at <strong>GH₵ 14</strong>. Customer pays GH₵ 14 via MoMo. You earn <span style={{ color: GOLD, fontWeight: 800 }}>GH₵ 4 profit instantly</span> — no manual action needed!</p>
          </div>
          {/* Withdraw section */}
          <div style={{ background: M.card, borderRadius: 14, border: `1px solid ${M.border}`, padding: "20px 18px" }}>
            <p style={{ color: M.text, fontWeight: 800, fontSize: 15, margin: "0 0 4px" }}>⬇️ Withdraw Reseller Earnings</p>
            <p style={{ color: M.muted, fontSize: 13, margin: "0 0 16px" }}>Minimum GH₵ {minWithdraw} · Sent to your MoMo via admin review</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ color: M.muted, fontSize: 11, margin: "0 0 2px" }}>Available</p>
                <p style={{ color: M.text, fontWeight: 800, fontSize: 18, margin: 0 }}>GH₵ {totalEarned.toFixed(2)}</p>
              </div>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ color: M.muted, fontSize: 11, margin: "0 0 2px" }}>Minimum</p>
                <p style={{ color: M.text, fontWeight: 800, fontSize: 18, margin: 0 }}>GH₵ {minWithdraw}.00</p>
              </div>
            </div>
            {withdrawMsg && <p style={{ color: totalEarned >= minWithdraw ? M.green : M.red, fontSize: 13, margin: "0 0 10px", fontWeight: 700 }}>{withdrawMsg}</p>}
            <button onClick={requestWithdraw} disabled={withdrawing} style={{ width: "100%", padding: "14px", borderRadius: 12, background: GOLD, color: "#000", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              {withdrawing ? "Submitting..." : "⬇️ Request Withdrawal"}
            </button>
            <p style={{ color: M.muted, fontSize: 12, textAlign: "center", margin: "8px 0 0" }}>You need at least GH₵ {minWithdraw} to withdraw. Keep selling!</p>
          </div>
        </div>
      )}

      {/* My Store & Prices tab */}
      {tab === "store" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Store name */}
          <div style={{ background: M.card, borderRadius: 14, border: `1px solid ${M.border}`, padding: "18px" }}>
            <p style={{ color: GOLD, fontWeight: 700, fontSize: 13, margin: "0 0 8px" }}>✏️ Custom Store Name</p>
            <p style={{ color: M.muted, fontSize: 12, margin: "0 0 10px" }}>This name appears on your public store page as the store title.</p>
            <input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Your store name..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${M.border}`, color: M.text, fontSize: 14, boxSizing: "border-box" as const }} />
          </div>
          {/* WhatsApp */}
          <div style={{ background: M.card, borderRadius: 14, border: `1px solid ${M.border}`, padding: "18px" }}>
            <p style={{ color: M.green, fontWeight: 700, fontSize: 13, margin: "0 0 8px" }}>📞 WhatsApp Contact Number (optional)</p>
            <p style={{ color: M.muted, fontSize: 12, margin: "0 0 10px" }}>Customers will see a "Chat on WhatsApp" button linked to this number on your store page.</p>
            <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="024XXXXXXX" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${M.border}`, color: M.text, fontSize: 14, boxSizing: "border-box" as const }} />
          </div>
          {saveMsg && <p style={{ color: M.green, fontWeight: 700, fontSize: 13, margin: 0 }}>{saveMsg}</p>}
          <button onClick={saveProfile} disabled={saving} style={{ padding: "14px", borderRadius: 12, background: GOLD, color: "#000", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {/* Store link */}
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, padding: "18px" }}>
            <p style={{ color: GOLD, fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>🔗 Your Store Link</p>
            <p style={{ color: M.muted, fontSize: 12, margin: "0 0 12px" }}>Share this link on WhatsApp, social media, or anywhere. Customers click and pay directly.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "10px 12px", overflow: "hidden" }}>
                <p style={{ color: GOLD, fontSize: 13, margin: 0, wordBreak: "break-all" as const }}>{storeLink}</p>
              </div>
              <button onClick={() => navigator.clipboard.writeText(storeLink)} style={{ padding: "10px 16px", borderRadius: 10, background: GOLD, color: "#000", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Copy</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => window.open(storeLink, "_blank")} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: `1px solid ${M.border}`, color: M.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔗 Preview Store</button>
              <button onClick={() => { const msg = `Check out my data store: ${storeLink}`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank"); }} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#25D366", border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Share on WhatsApp</button>
            </div>
          </div>
          {/* Steps reminder */}
          <div style={{ display: "flex", gap: 8 }}>
            {["1. Set your prices below", "2. Toggle products ON to add to store", "3. Share your link & earn automatically"].map((s, i) => (
              <div key={i} style={{ flex: 1, background: M.card, border: `1px solid ${M.border}`, borderRadius: 10, padding: "10px 8px", textAlign: "center" as const }}>
                <p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{s}</p>
              </div>
            ))}
          </div>
          <ReferralsPage data={data} />
        </div>
      )}

      {/* Sales Report tab */}
      {tab === "sales" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: M.card, borderRadius: 14, border: `1px solid ${M.border}`, overflow: "hidden" }}>
            {data.orders.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" as const }}>
                <p style={{ fontSize: 36, margin: "0 0 12px" }}>📊</p>
                <p style={{ color: M.text, fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>No sales yet</p>
                <p style={{ color: M.muted, fontSize: 13, margin: 0 }}>Share your store link to start earning.</p>
              </div>
            ) : data.orders.slice(0, 30).map((o, i) => {
              const nb = netBadge(o.network); const sb = statusBadge(o.status);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < data.orders.length - 1 ? `1px solid ${M.border}` : "none" }}>
                  <span style={{ background: nb.bg, color: nb.color, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800 }}>{nb.label}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: M.text, fontWeight: 600, fontSize: 13, margin: 0 }}>{o.bundle_size} · {o.phone?.slice(0, 3)}***{o.phone?.slice(-3)}</p>
                    <p style={{ color: M.muted, fontSize: 11, margin: 0 }}>{new Date(o.created_at).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                  </div>
                  <div style={{ textAlign: "right" as const }}>
                    <p style={{ color: GOLD, fontWeight: 700, fontSize: 13, margin: 0 }}>GH₵{Number(o.amount).toFixed(2)}</p>
                    <span style={{ background: sb.bg, color: sb.color, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{sb.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notifications Page ───────────────────────────────────────────────────────
function NotificationsPage({ data }: { data: AgentData }) {
  const items = [...data.orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ color: M.text, fontSize: 28, fontWeight: 900, margin: 0 }}>Notifications</h1>
        <p style={{ color: M.muted, fontSize: 14, margin: "4px 0 0" }}>Recent activity on your account</p>
      </div>
      <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, overflow: "hidden" }}>
        {items.length === 0 && (
          <div style={{ padding: 64, textAlign: "center", color: M.muted }}>
            <p style={{ fontSize: 40, margin: "0 0 12px" }}>🔔</p>
            <p style={{ fontWeight: 700, color: M.text, fontSize: 15 }}>No notifications yet</p>
            <p style={{ fontSize: 13, color: M.muted }}>When you receive orders, they'll appear here.</p>
          </div>
        )}
        {items.map((o, i) => {
          const sb = statusBadge(o.status); const nb = netBadge(o.network);
          const cleanSize = (o.bundle_size ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel|vodafone)\s+/i, "").trim();
          const isNew = (Date.now() - new Date(o.created_at).getTime()) < 24 * 60 * 60 * 1000;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 24px", borderBottom: i < items.length - 1 ? `1px solid ${M.border}` : "none", background: isNew ? "#f8faff" : "transparent" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: sb.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {o.status.toLowerCase() === "completed" ? "✅" : o.status.toLowerCase() === "processing" ? "⏳" : o.status.toLowerCase() === "pending" ? "🕐" : "❌"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <p style={{ fontWeight: 700, color: M.text, fontSize: 14, margin: 0 }}>Order {o.status.charAt(0).toUpperCase() + o.status.slice(1).toLowerCase()}</p>
                  {isNew && <span style={{ background: "#dbeafe", color: M.blue, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>NEW</span>}
                </div>
                <p style={{ color: M.muted, fontSize: 13, margin: "0 0 6px" }}>
                  <span style={{ background: nb.bg, color: nb.color, padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 800, marginRight: 6 }}>{nb.label}</span>
                  {cleanSize} → {(o.phone ?? "").slice(0, 3)}****{(o.phone ?? "").slice(-3)} · GH₵{Number(o.amount).toFixed(2)}
                </p>
                <p style={{ color: M.sub, fontSize: 12, margin: 0 }}>{new Date(o.created_at).toLocaleString("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <span style={{ background: sb.bg, color: sb.color, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{sb.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Support Page ─────────────────────────────────────────────────────────────
function SupportPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 620 }}>
      <div>
        <h1 style={{ color: M.text, fontSize: 28, fontWeight: 900, margin: 0 }}>Contact Support</h1>
        <p style={{ color: M.muted, fontSize: 14, margin: "4px 0 0" }}>We're here to help you, 7 days a week</p>
      </div>

      {/* WhatsApp card */}
      <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, padding: "28px 28px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>💬</div>
          <div>
            <p style={{ fontWeight: 800, color: M.text, fontSize: 17, margin: 0 }}>WhatsApp Support</p>
            <p style={{ color: M.muted, fontSize: 13, margin: "2px 0 0" }}>Fastest way to reach us</p>
          </div>
        </div>
        <p style={{ color: M.muted, fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>Click below to open WhatsApp and send us a message. Our support team usually responds within a few minutes.</p>
        <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#16a34a", color: "white", textDecoration: "none", borderRadius: 12, padding: "14px 24px", fontSize: 15, fontWeight: 700 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.126 1.528 5.858L.057 24l6.303-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.95 0-3.77-.527-5.33-1.44l-.38-.226-3.744.982.998-3.648-.248-.376A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
          Chat with Support on WhatsApp
        </a>
      </div>

      {/* Operating hours */}
      <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, padding: "24px 28px" }}>
        <p style={{ fontWeight: 800, color: M.text, fontSize: 16, margin: "0 0 16px" }}>Operating Hours</p>
        {[
          { day: "Monday – Friday", hours: "8:00 AM – 9:00 PM" },
          { day: "Saturday", hours: "9:00 AM – 8:00 PM" },
          { day: "Sunday", hours: "10:00 AM – 6:00 PM" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: i < 2 ? `1px solid ${M.border}` : "none" }}>
            <span style={{ fontSize: 14, color: M.text, fontWeight: 600 }}>{r.day}</span>
            <span style={{ fontSize: 14, color: M.muted }}>{r.hours}</span>
          </div>
        ))}
        <div style={{ marginTop: 16, background: "rgba(59,130,246,0.12)", borderRadius: 10, padding: "12px 16px" }}>
          <p style={{ color: M.blue, fontSize: 13, fontWeight: 700, margin: 0 }}>⚡ Response Time: Usually within 5 minutes during working hours</p>
        </div>
      </div>

      {/* Common questions */}
      <div style={{ background: M.card, borderRadius: 18, border: `1px solid ${M.border}`, padding: "24px 28px" }}>
        <p style={{ fontWeight: 800, color: M.text, fontSize: 16, margin: "0 0 16px" }}>Common Questions</p>
        {[
          { q: "How do I top up my wallet?", a: "Click 'Deposit Funds' in Wallet section. Accepts Mobile Money and card via Paystack." },
          { q: "My order is stuck on 'Processing'?", a: "Wait 10–15 minutes. If it stays stuck, contact support with your Order ID." },
          { q: "How do I withdraw my earnings?", a: "Go to Wallet → Withdraw. Minimum withdrawal is GH₵5. Processed within 24 hours." },
          { q: "How do referrals work?", a: "Share your store link. Earn commission on every data bundle sold through your link." },
        ].map((item, i) => (
          <div key={i} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: i < 3 ? `1px solid ${M.border}` : "none" }}>
            <p style={{ fontWeight: 700, color: M.text, fontSize: 14, margin: "0 0 4px" }}>{item.q}</p>
            <p style={{ color: M.muted, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, data, onLogout, onWithdraw, open, onClose }: { page: Page; setPage: (p: Page) => void; data: AgentData; onLogout: () => void; onWithdraw: () => void; open: boolean; onClose: () => void }) {
  const isPriceMode = data.agent_type === "custom_price";
  const isPro = data.registration_ref !== "FREE";
  const initial1 = (data.name ?? "A").charAt(0).toUpperCase();
  const initial2 = (data.name ?? "").split(" ")[1]?.charAt(0).toUpperCase() ?? "";

  const navItems: { id: Page; label: string; svg: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
    { id: "buy_data",  label: "Buy Data",  svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg> },
    { id: "wallet",    label: "Wallet",    svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg> },
    { id: "prices",    label: isPriceMode ? "My Prices" : "My Shop", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg> },
    { id: "orders",    label: "My Orders", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> },
    { id: "customers", label: "Customers", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
    { id: "affiliate", label: "Affiliate",  svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg> },
    { id: "notifications", label: "Notifications", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> },
    { id: "api",       label: "Developer API", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg> },
    { id: "support",   label: "Contact Support", svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg> },
    { id: "profile",   label: "Profile",   svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> },
  ];

  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />}
      <aside style={{ position: "fixed", top: 0, left: open ? 0 : -280, bottom: 0, width: 260, background: SB.bg, borderRight: `1px solid ${SB.border}`, display: "flex", flexDirection: "column", zIndex: 50, transition: "left 0.25s ease" }} className="sidebar-desktop">

        {/* Logo */}
        <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${SB.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "white", fontSize: 16, flexShrink: 0 }}>E</div>
          <div>
            <p style={{ color: SB.text, fontWeight: 900, fontSize: 15, margin: 0, lineHeight: 1 }}>Elite Data</p>
            <p style={{ color: "#4ade80", fontSize: 10, margin: "2px 0 0", fontWeight: 700, letterSpacing: 0.5 }}>Agent Portal</p>
          </div>
        </div>

        {/* USER pill + wallet card */}
        <div style={{ padding: "14px 12px 8px" }}>
          {/* USER pill */}
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px", marginBottom: 10, border: `1px solid ${SB.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, color: "white", flexShrink: 0 }}>{initial1}{initial2}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: SB.text, fontWeight: 700, fontSize: 13, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.name}</p>
                <p style={{ color: SB.muted, fontSize: 11, margin: "1px 0 0" }}>ID: {data.referral_code}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, background: "rgba(74,222,128,0.15)", color: "#4ade80", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(74,222,128,0.3)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }}></span>
                Online
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, background: isPro ? "rgba(124,58,237,0.2)" : "rgba(59,130,246,0.2)", color: isPro ? "#a78bfa" : "#60a5fa", border: `1px solid ${isPro ? "rgba(124,58,237,0.3)" : "rgba(59,130,246,0.3)"}` }}>
                {isPro ? "PRO" : "FREE"}
              </span>
            </div>
          </div>

          {/* Wallet balance card */}
          <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,0.18),rgba(124,58,237,0.18))", borderRadius: 14, padding: "14px 16px", border: "1px solid rgba(59,130,246,0.25)" }}>
            <p style={{ fontSize: 10, color: SB.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 4px" }}>Wallet Balance</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#60a5fa", margin: "0 0 10px", lineHeight: 1 }}>GH₵ {(data.wallet_balance ?? 0).toFixed(2)}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setPage("wallet"); onClose(); }} style={{ flex: 1, background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Deposit</button>
              <button onClick={() => { onWithdraw(); onClose(); }} style={{ flex: 1, background: "rgba(255,255,255,0.08)", color: SB.text, border: `1px solid ${SB.border}`, borderRadius: 8, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Withdraw</button>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "4px 10px 8px", overflowY: "auto" }}>
          {navItems.map(item => {
            const active = page === item.id || (item.id === "buy_data" && page === "place_order");
            return (
              <button key={item.id} onClick={() => { setPage(item.id); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: active ? "linear-gradient(90deg,#3b82f6,#7c3aed)" : "transparent", color: active ? "white" : SB.muted, fontSize: 13, fontWeight: active ? 700 : 500, textAlign: "left", marginBottom: 2, transition: "all 0.15s" }}>
                <span style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>{item.svg}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: "8px 10px 16px", borderTop: `1px solid ${SB.border}` }}>
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "rgba(248,113,113,0.1)", color: "#f87171", fontSize: 13, fontWeight: 700, textAlign: "left", width: "100%" }}>
            <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Logout
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
  const isPro = data.registration_ref !== "FREE";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as Record<string, unknown>).PaystackPop) return;
    if (document.querySelector('script[src*="paystack"]')) return;
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: M.bg, display: "flex" }}>
      <Sidebar page={page} setPage={setPage} data={data} onLogout={onLogout} onWithdraw={() => setShowWithdraw(true)} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }} className="main-with-sidebar">
        {/* FuzeServe-style mobile header */}
        <header className="mobile-header" style={{ display: "none", background: SB.bg, padding: "10px 20px", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30, borderBottom: `1px solid ${SB.border}` }}>
          {/* USER / PRO pill */}
          <div onClick={() => setPage("profile")} style={{ display: "flex", alignItems: "center", gap: 7, background: isPro ? "#f59e0b" : M.blue, borderRadius: 20, padding: "7px 14px 7px 10px", cursor: "pointer", userSelect: "none" }}>
            <svg width={15} height={15} fill="none" stroke="white" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            <span style={{ color: "white", fontWeight: 800, fontSize: 13, letterSpacing: 0.3 }}>{isPro ? "PRO" : "USER"}</span>
          </div>
          {/* Bell + Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={() => setPage("notifications")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, position: "relative" }}>
              <svg width={22} height={22} fill="none" stroke="#94a3b8" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              {data.orders.length > 0 && <span style={{ position: "absolute", top: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />}
            </button>
            <div onClick={() => setPage("profile")} style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "white", fontSize: 15, cursor: "pointer" }}>
              {(data.name ?? "A").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: "28px 28px", overflowY: "auto", maxWidth: 1300, width: "100%", margin: "0 auto" }} className="main-content">
          {page === "dashboard"    && <DashboardPage data={data} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} onNavigate={setPage} />}
          {page === "orders"       && <OrdersPage orders={data.orders} agentId={data.id} onPlaceOrder={() => setPage("buy_data")} />}
          {page === "customers"    && <CustomersPage orders={data.orders} />}
          {page === "wallet"       && <WalletPage data={data} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} />}
          {page === "transactions" && <TransactionsPage data={data} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} />}
          {page === "referrals"    && <ReferralsPage data={data} />}
          {page === "leaderboard"  && <LeaderboardPage myCode={data.referral_code} />}
          {page === "api"          && <ApiPage data={data} />}
          {page === "profile"      && <ProfilePage data={data} />}
          {page === "settings"     && <SettingsPage />}
          {page === "prices"       && (data.agent_type === "custom_price" ? <PricesPage data={data} /> : <ReferralsPage data={data} />)}
          {(page === "place_order" || page === "buy_data") && <PlaceOrderPage data={data} onRefresh={onRefresh} />}
          {page === "affiliate"    && <AffiliatePage data={data} />}
          {page === "notifications" && <NotificationsPage data={data} />}
          {page === "support"      && <SupportPage />}
        </main>

        {/* Bottom navigation — expanding pill style */}
        <nav className="bottom-nav" style={{ display: "none", position: "fixed", bottom: 14, left: 0, right: 0, alignItems: "center", justifyContent: "center", zIndex: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderRadius: 999, background: "rgba(6,12,28,0.97)", boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)", backdropFilter: "blur(24px)" }}>
            {([
              { id: "dashboard", label: "Home",      onClick: () => setPage("dashboard"),  active: page === "dashboard",  svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
              { id: "buy_data",  label: "Buy Data",  onClick: () => setPage("buy_data"),   active: page === "buy_data",   svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg> },
              { id: "affiliate", label: "Sale&Earn", onClick: () => setPage("affiliate"),  active: page === "affiliate",  svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg> },
              { id: "referrals", label: "Rewards",   onClick: () => setPage("referrals"),  active: page === "referrals",  svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg> },
              { id: "more",      label: "More",      onClick: () => setSidebarOpen(true),  active: sidebarOpen,           svg: <svg width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg> },
            ] as { id: string; label: string; onClick: () => void; active: boolean; svg: React.ReactNode }[]).map(item => (
              <button key={item.id}
                onClick={item.onClick}
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 7,
                  height: 44, padding: item.active ? "0 14px 0 6px" : "0 6px",
                  borderRadius: 999,
                  background: item.active ? "rgba(245,158,11,0.18)" : "transparent",
                  boxShadow: item.active ? "0 0 18px rgba(245,158,11,0.2)" : "none",
                  border: "none", cursor: "pointer", overflow: "hidden", flexShrink: 0,
                  color: item.active ? "#f59e0b" : "#4b5563",
                  transition: "background .35s ease, box-shadow .35s ease, padding .4s cubic-bezier(.22,1,.36,1)",
                }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.active ? "rgba(245,158,11,0.18)" : "transparent", transition: "background .3s ease" }}>
                  {item.svg}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", maxWidth: item.active ? 72 : 0, opacity: item.active ? 1 : 0, overflow: "hidden", transform: item.active ? "translateX(0)" : "translateX(-6px)", transition: "max-width .45s cubic-bezier(.22,1,.36,1), opacity .25s ease, transform .35s ease" }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {showAddFunds && <AddFundsModal agentId={data.id} agentEmail={data.email} onClose={() => setShowAddFunds(false)} onSuccess={onRefresh} />}
      {showWithdraw && <WithdrawModal agentId={data.id} referralCode={data.referral_code} profitBalance={data.agent_type === "custom_price" ? (data.commission_balance ?? 0) + (data.paystack_wallet_balance ?? 0) : (data.commission_balance ?? 0)} onClose={() => setShowWithdraw(false)} onSuccess={onRefresh} />}

      <style>{`
        /* FuzeServe layout — header + bottom nav always on */
        .mobile-header { display: flex !important; }
        .bottom-nav { display: flex !important; justify-content: center !important; }
        .main-content { padding: 16px 16px 82px !important; }
        /* Dark theme: override hardcoded light inputs */
        input, textarea, select {
          background: #1e293b !important;
          color: #f8fafc !important;
          border-color: #1e3a5f !important;
        }
        input::placeholder, textarea::placeholder { color: #475569 !important; }
        /* Responsive grids */
        @media (max-width: 767px) {
          .stat-grid { grid-template-columns: 1fr 1fr !important; }
          .main-grid { grid-template-columns: 1fr !important; }
          .wallet-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 768px) and (max-width: 1199px) {
          .stat-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
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
