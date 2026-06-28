"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const MARGIN = 1.82; // GH₵ estimated margin per bundle

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

export default function AgentPage() {
  const router = useRouter();

  // ── Wizard state ────────────────────────────────────────────────
  const [wizardStep, setWizardStep] = useState<"earning" | "goal" | "form">("earning");
  const [bundlesPerDay, setBundlesPerDay] = useState(10);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  // ── Registration form state ─────────────────────────────────────
  const [form, setFormState] = useState({
    name: "", email: "", phone: "", whatsapp: "", business_name: "", password: "", confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("elite_agent_applied") === "true") {
        router.replace("/agent/dashboard");
      }
    } catch {}
    if (!document.querySelector('script[src*="paystack"]')) {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, [router]);

  function set(field: string, value: string) {
    setFormState(f => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.whatsapp.trim()) return setError("Name, email, phone, and WhatsApp are all required.");
    if (!form.email.includes("@")) return setError("Enter a valid email address.");
    if (!form.password) return setError("Please create a password.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ps = (window as any).PaystackPop;
    if (!ps) return setError("Payment not ready yet. Please wait a moment and try again.");
    setLoading(true);
    try {
      const handler = ps.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email: form.email,
        amount: 4000,
        currency: "GHS",
        label: "Elite Data Agent Registration Fee",
        callback: (response: { reference: string }) => {
          fetch("/api/agents/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, whatsapp: form.whatsapp, business_name: form.business_name, password: form.password, agent_type: "custom_price", paystackRef: response.reference }),
          })
            .then(r => r.json())
            .then(data => {
              setLoading(false);
              if (data.success) { try { localStorage.setItem("elite_agent_applied", "true"); } catch {} setSuccess(true); }
              else setError(data.error || "Registration failed. Contact support on WhatsApp.");
            })
            .catch(() => { setLoading(false); setError("Network error. Contact support on WhatsApp."); });
        },
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) { setLoading(false); setError(`Payment error: ${String(err)}`); }
  }

  // ── Success screen ──────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">You&apos;re Approved! 🎉</h1>
          <p className="text-lg font-semibold text-green-600 mb-6">Your account is active — log in now and start selling.</p>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-6 py-6 mb-6 text-left space-y-4">
            <p className="text-gray-700 text-sm leading-relaxed">Welcome <span className="font-bold text-gray-900">{form.name}</span>! Your GH₵40 registration fee has been received.</p>
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">What to do next:</p>
              {[
                { step: "1", text: "Log in to your dashboard using your email and password" },
                { step: "2", text: "Go to Wallet → Top Up to fund your account" },
                { step: "3", text: "Go to My Prices → set your selling prices" },
                { step: "4", text: "Share your shop link and start earning!" },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                  <p className="text-sm text-gray-700">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
          <a href="/agent/dashboard" className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-4 rounded-2xl text-base transition-colors shadow-lg mb-4">Go to My Dashboard →</a>
          <a href="/" className="text-blue-600 hover:underline text-sm font-semibold">Back to Home</a>
        </div>
      </div>
    );
  }

  const monthly = Math.round(bundlesPerDay * MARGIN * 30);

  // ── Wizard Step 1 — Earning Potential ──────────────────────────
  if (wizardStep === "earning") {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 480, padding: "24px 20px 48px" }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 36, height: 8, borderRadius: 4, background: "#2563eb" }} />
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e2e8f0" }} />
              </div>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Step 1 of 2</span>
            </div>
            <button onClick={() => setWizardStep("form")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px", lineHeight: 1.2 }}>See your earning potential</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 }}>Move the slider to see how much you could earn monthly</p>

          {/* Earning display card */}
          <div style={{ background: "linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#2563eb 100%)", borderRadius: 22, padding: "28px 24px 24px", marginBottom: 28, textAlign: "center", boxShadow: "0 12px 40px rgba(37,99,235,0.3)" }}>
            <p style={{ fontSize: 56, fontWeight: 900, color: "#4ade80", margin: "0 0 8px", lineHeight: 1, letterSpacing: "-2px" }}>
              GH₵ {monthly.toLocaleString()}
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: "0 0 6px" }}>estimated monthly earnings</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              {bundlesPerDay} bundles/day × ~GH₵{MARGIN.toFixed(2)} margin × 30 days
            </p>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Bundles sold per day</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#2563eb" }}>{bundlesPerDay}</span>
            </div>
            <input
              type="range" min={1} max={100} value={bundlesPerDay}
              onChange={e => setBundlesPerDay(Number(e.target.value))}
              style={{ width: "100%", height: 6, accentColor: "#2563eb", cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>1/day</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>100/day</span>
            </div>
          </div>

          {/* Feature mini cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 32 }}>
            {[
              { title: "Wholesale prices", sub: "Buy cheaper than retail" },
              { title: "Your own store", sub: "Share your personal link" },
              { title: "Set your margins", sub: "You decide what to charge" },
            ].map(c => (
              <div key={c.title} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 10px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", margin: "0 0 5px", lineHeight: 1.3 }}>{c.title}</p>
                <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.4 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => setWizardStep("goal")}
            style={{ width: "100%", background: "#2563eb", color: "white", border: "none", borderRadius: 16, padding: "17px", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 24px rgba(37,99,235,0.35)", transition: "opacity .15s" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            Set My Income Goal →
          </button>

          <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 14 }}>
            Already an agent? <a href="/agent/dashboard" style={{ color: "#2563eb", fontWeight: 700 }}>Sign in →</a>
          </p>
        </div>
      </div>
    );
  }

  // ── Wizard Step 2 — Income Goal ────────────────────────────────
  if (wizardStep === "goal") {
    const goals = [
      { label: "GH₵ 200", sub: "per month", value: "200" },
      { label: "GH₵ 500", sub: "per month", value: "500" },
      { label: "GH₵ 1,000", sub: "per month", value: "1000" },
      { label: "1,000+", sub: "custom", value: "1000+" },
    ];
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 480, padding: "24px 20px 48px" }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setWizardStep("earning")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 }}>← Back</button>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
                <div style={{ width: 36, height: 8, borderRadius: 4, background: "#2563eb" }} />
              </div>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Step 2 of 2</span>
            </div>
            <button onClick={() => setWizardStep("form")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px", lineHeight: 1.2 }}>Set your income goal</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 }}>How much do you want to earn per month?</p>

          {/* Goal cards 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {goals.map(g => (
              <button
                key={g.value}
                onClick={() => setSelectedGoal(g.value)}
                style={{
                  background: selectedGoal === g.value ? "#eff6ff" : "white",
                  border: `2px solid ${selectedGoal === g.value ? "#2563eb" : "#e2e8f0"}`,
                  borderRadius: 18, padding: "22px 16px", textAlign: "center", cursor: "pointer",
                  transition: "all .18s", boxShadow: selectedGoal === g.value ? "0 4px 18px rgba(37,99,235,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                <p style={{ fontSize: 22, fontWeight: 900, color: selectedGoal === g.value ? "#2563eb" : "#0f172a", margin: "0 0 4px" }}>{g.label}</p>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0, fontWeight: 500 }}>{g.sub}</p>
              </button>
            ))}
          </div>

          {/* Fee notice */}
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 16, padding: "14px 16px", marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>💡</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#92400e", margin: "0 0 3px" }}>Elite Data Agent · GH₵40 one-time fee</p>
              <p style={{ fontSize: 12, color: "#78350f", margin: 0, lineHeight: 1.5 }}>Pay once, set your own prices, and start earning. No monthly fees.</p>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => setWizardStep("form")}
            style={{
              width: "100%",
              background: selectedGoal ? "#2563eb" : "#cbd5e1",
              color: "white", border: "none", borderRadius: 16, padding: "17px",
              fontSize: 16, fontWeight: 800,
              cursor: selectedGoal ? "pointer" : "default",
              boxShadow: selectedGoal ? "0 6px 24px rgba(37,99,235,0.35)" : "none",
              transition: "all .2s",
            }}
          >
            Create Agent Account →
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
            Free to sign up · Pay GH₵40 once to activate
          </p>
        </div>
      </div>
    );
  }

  // ── Registration Form (existing) ───────────────────────────────
  const [leaving, setLeaving] = useState(false);
  function goLogin() { setLeaving(true); setTimeout(() => { window.location.href = "/agent/dashboard"; }, 820); }
  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#060c1c 0%,#0d1b2e 60%,#1e1b4b 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>

      <div className={`auth-container${leaving ? " active" : ""}`} style={{ position: "relative", width: "100%", maxWidth: 900, minHeight: 640, borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>

        <div className="form-panel--register" style={{ position: "absolute", inset: 0, background: "white", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "36px 36px 36px 0" }}>
          <div style={{ width: "100%", maxWidth: 420, overflowY: "auto", maxHeight: "calc(100vh - 80px)" }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "white", marginBottom: 12 }}>E</div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", margin: "0 0 3px" }}>Create Agent Account</h1>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Pay GH₵40 once — activated instantly, no waiting</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {error && <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, padding: "10px 12px", borderRadius: 10 }}>{error}</div>}

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Full Name <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="text" placeholder="e.g. Kwame Mensah" value={form.name} onChange={e => set("name", e.target.value)} className={inp} /></div>

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Email <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="email" placeholder="kwame@gmail.com" value={form.email} onChange={e => set("email", e.target.value)} className={inp} /></div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Phone <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.phone} onChange={e => set("phone", e.target.value)} className={inp} /></div>
                <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>WhatsApp <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} className={inp} /></div>
              </div>

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Business Name <span style={{ color: "#94a3b8", fontWeight: 500 }}>(optional)</span></label>
                <input type="text" placeholder="e.g. Kwame's Data Hub" value={form.business_name} onChange={e => set("business_name", e.target.value)} className={inp} /></div>

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>Create Password</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Password <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type={showPw ? "text" : "password"} placeholder="Min 6 characters" value={form.password} onChange={e => set("password", e.target.value)} className={inp} style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><EyeIcon open={showPw} /></button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Confirm Password <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type={showConfirm ? "text" : "password"} placeholder="Repeat password" value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} className={inp} style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowConfirm(s => !s)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><EyeIcon open={showConfirm} /></button>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{ background: loading ? "#94a3b8" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}>
                {loading ? "Opening payment…" : "Pay GH₵40 & Activate →"}
              </button>
            </form>

            <p className="mobile-login-link" style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 18, display: "none" }}>
              Already an agent? <a href="/agent/dashboard" style={{ color: "#3b82f6", fontWeight: 700 }}>Sign in →</a>
            </p>
          </div>
        </div>

        <div className="overlay-panel-reg" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#7c3aed 0%,#1d4ed8 60%,#0369a1 100%)", display: "flex", alignItems: "center", paddingLeft: 48, paddingRight: "52%" }}>
          <div style={{ maxWidth: 280, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: "white", margin: "0 0 12px", lineHeight: 1.2 }}>Already an Agent?</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: "0 0 28px", lineHeight: 1.6 }}>
              Welcome back! Sign in to access your dashboard, check your wallet, and manage your sales.
            </p>
            <button onClick={goLogin} style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 14, padding: "12px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)" }}>
              Sign In →
            </button>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 20 }}>GH₵40 one-time fee · Set your own prices</p>
          </div>
        </div>
      </div>

      <style>{`
        .overlay-panel-reg {
          clip-path: polygon(0 0, 56% 0, 62% 100%, 0 100%);
          transition: transform 900ms cubic-bezier(.77,0,.18,1), clip-path 900ms cubic-bezier(.77,0,.18,1);
        }
        .auth-container.active .overlay-panel-reg {
          transform: translateX(100%);
          clip-path: polygon(38% 0, 100% 0, 100% 100%, 44% 100%);
        }
        .form-panel--register { transition: opacity 450ms ease, transform 450ms ease, filter 450ms ease; }
        .auth-container.active .form-panel--register { opacity:0; transform:translateX(60px); filter:blur(6px); }
        @media (max-width: 600px) {
          .overlay-panel-reg { display: none !important; }
          .mobile-login-link { display: block !important; }
          .auth-container { min-height: auto !important; border-radius: 20px !important; }
          .form-panel--register { position: relative !important; padding: 28px 20px !important; justify-content: flex-start !important; }
        }
      `}</style>
    </div>
  );
}
