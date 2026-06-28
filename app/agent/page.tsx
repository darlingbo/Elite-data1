"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const MARGIN = 1.82;
const PRO_FEE = 40; // GH₵

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

type WizardStep = "earning" | "plan" | "form";

export default function AgentPage() {
  const router = useRouter();

  // ── Wizard ────────────────────────────────────────────────────────────────
  const [wizardStep, setWizardStep]     = useState<WizardStep>("earning");
  const [bundlesPerDay, setBundlesPerDay] = useState(10);
  const [agentPlan, setAgentPlan]       = useState<"free" | "pro" | null>(null);

  // ── Animation ─────────────────────────────────────────────────────────────
  const [leaving, setLeaving] = useState(false);

  // ── Form ──────────────────────────────────────────────────────────────────
  const [form, setFormState] = useState({
    name: "", email: "", phone: "", whatsapp: "", business_name: "", password: "", confirmPassword: "",
  });
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState(false);   // pro success
  const [pending, setPending]         = useState(false);   // free pending

  useEffect(() => {
    try { if (localStorage.getItem("elite_agent_applied") === "true") router.replace("/agent/dashboard"); } catch {}
    if (!document.querySelector('script[src*="paystack"]')) {
      const s = document.createElement("script"); s.src = "https://js.paystack.co/v1/inline.js"; s.async = true; document.body.appendChild(s);
    }
  }, [router]);

  function setField(field: string, value: string) { setFormState(f => ({ ...f, [field]: value })); setError(""); }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault(); setError("");

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.whatsapp.trim())
      return setError("Name, email, phone and WhatsApp are all required.");
    if (!form.email.includes("@")) return setError("Enter a valid email address.");
    if (!form.password) return setError("Please create a password.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");

    const payload = { name: form.name, email: form.email, phone: form.phone, whatsapp: form.whatsapp, business_name: form.business_name, password: form.password };

    // ── Free Plan: direct submit, no payment ──────────────────────────────
    if (agentPlan === "free") {
      setLoading(true);
      try {
        const res  = await fetch("/api/agents/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, plan: "free" }) });
        const data = await res.json();
        if (data.success) { try { localStorage.setItem("elite_agent_applied", "true"); } catch {} setPending(true); }
        else setError(data.error || "Registration failed. Contact support.");
      } catch { setError("Network error. Please try again."); }
      finally { setLoading(false); }
      return;
    }

    // ── Pro Plan: Paystack → submit ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ps = (window as any).PaystackPop;
    if (!ps) return setError("Payment gateway not ready. Please wait a moment and try again.");
    setLoading(true);
    try {
      const handler = ps.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email: form.email,
        amount: PRO_FEE * 100,
        currency: "GHS",
        label: "Elite Data Pro Agent Registration",
        callback: (response: { reference: string }) => {
          fetch("/api/agents/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, plan: "pro", paystackRef: response.reference }) })
            .then(r => r.json())
            .then(data => {
              setLoading(false);
              if (data.success) { try { localStorage.setItem("elite_agent_applied", "true"); } catch {} setSuccess(true); }
              else setError(data.error || "Registration failed. Contact support on WhatsApp.");
            })
            .catch(() => { setLoading(false); setError("Network error. Payment went through — contact support with your reference."); });
        },
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) { setLoading(false); setError(`Payment error: ${String(err)}`); }
  }

  // ── Free Agent — Pending Screen ───────────────────────────────────────────
  if (pending) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>📋</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>Application Submitted!</h1>
          <p style={{ fontSize: 15, color: "#16a34a", fontWeight: 700, margin: "0 0 20px" }}>You&apos;re on the waiting list — we&apos;ll approve you within 24 hours.</p>
          <div style={{ background: "white", borderRadius: 20, border: "1px solid #e2e8f0", padding: "24px 24px 20px", marginBottom: 20, textAlign: "left" }}>
            <p style={{ fontSize: 13, color: "#475569", margin: "0 0 16px" }}>
              Hi <b style={{ color: "#0f172a" }}>{form.name}</b>! Your free agent application has been received. Here&apos;s what happens next:
            </p>
            {[
              { n: "1", text: "Admin reviews your application (usually within 24 hrs)" },
              { n: "2", text: "You get notified on WhatsApp when approved" },
              { n: "3", text: "Log in and start setting your prices and selling!" },
            ].map(s => (
              <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2563eb", color: "white", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
                <p style={{ fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.5 }}>{s.text}</p>
              </div>
            ))}
            <div style={{ background: "#eff6ff", borderRadius: 12, padding: "12px 14px", marginTop: 8 }}>
              <p style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700, margin: "0 0 2px" }}>💡 Want instant access?</p>
              <p style={{ fontSize: 12, color: "#3b82f6", margin: 0 }}>Upgrade to Pro for GH₵{PRO_FEE} — get approved automatically right now.</p>
            </div>
          </div>
          <a href="/agent/dashboard" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#2563eb", color: "white", textDecoration: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
            Go to Login →
          </a>
          <a href="/" style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Back to Home</a>
        </div>
      </div>
    );
  }

  // ── Pro Agent — Success Screen ────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">You&apos;re a Pro Agent! 🎉</h1>
          <p className="text-lg font-semibold text-green-600 mb-6">Your account is active — log in and start selling now.</p>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-6 py-6 mb-6 text-left space-y-4">
            <p className="text-gray-700 text-sm">Welcome <b className="text-gray-900">{form.name}</b>! Your GH₵{PRO_FEE} fee is confirmed and your Pro account is live.</p>
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">What to do next:</p>
              {[
                { step: "1", text: "Log in with your email and password" },
                { step: "2", text: "Go to Wallet → Add Funds to top up your working capital" },
                { step: "3", text: "Go to My Prices → set your selling prices" },
                { step: "4", text: "Share your store link and start earning!" },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                  <p className="text-sm text-gray-700">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
          <a href="/agent/dashboard" className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-4 rounded-2xl text-base transition-colors shadow-lg mb-4">Go to Dashboard →</a>
          <a href="/" className="text-blue-600 hover:underline text-sm font-semibold">Back to Home</a>
        </div>
      </div>
    );
  }

  const monthly = Math.round(bundlesPerDay * MARGIN * 30);

  // ── Wizard Step 1 — Earning Potential ────────────────────────────────────
  if (wizardStep === "earning") {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 480, padding: "24px 20px 48px" }}>
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 36, height: 8, borderRadius: 4, background: "#2563eb" }} />
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e2e8f0" }} />
              </div>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Step 1 of 2</span>
            </div>
            <button onClick={() => setWizardStep("form")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 22, padding: 4 }}>×</button>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px", lineHeight: 1.2 }}>See your earning potential</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>Move the slider to see how much you could earn monthly</p>

          {/* Earning card */}
          <div style={{ background: "linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)", borderRadius: 22, padding: "28px 24px 24px", marginBottom: 28, textAlign: "center", boxShadow: "0 12px 40px rgba(37,99,235,0.3)" }}>
            <p style={{ fontSize: 56, fontWeight: 900, color: "#4ade80", margin: "0 0 8px", lineHeight: 1, letterSpacing: "-2px" }}>GH₵ {monthly.toLocaleString()}</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: "0 0 6px" }}>estimated monthly earnings</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{bundlesPerDay} bundles/day × ~GH₵{MARGIN.toFixed(2)} margin × 30 days</p>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Bundles sold per day</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#2563eb" }}>{bundlesPerDay}</span>
            </div>
            <input type="range" min={1} max={100} value={bundlesPerDay} onChange={e => setBundlesPerDay(Number(e.target.value))} style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer" }} />
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
              <div key={c.title} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", margin: "0 0 5px", lineHeight: 1.3 }}>{c.title}</p>
                <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.4 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          <button onClick={() => setWizardStep("plan")} style={{ width: "100%", background: "#2563eb", color: "white", border: "none", borderRadius: 16, padding: "17px", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 24px rgba(37,99,235,0.35)" }}>
            Choose My Plan →
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 14 }}>
            Already an agent? <a href="/agent/dashboard" style={{ color: "#2563eb", fontWeight: 700 }}>Sign in →</a>
          </p>
        </div>
      </div>
    );
  }

  // ── Wizard Step 2 — Plan Selection ───────────────────────────────────────
  if (wizardStep === "plan") {
    const freeFeatures = ["Set your own prices", "Buy at wholesale rates", "Keep 100% of your margin", "Basic dashboard & wallet"];
    const proFeatures  = ["Everything in Free", "⚡ Instant approval — start immediately", "Priority WhatsApp support", "Custom store link"];
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 480, padding: "24px 20px 48px" }}>
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setWizardStep("earning")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 }}>← Back</button>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
                <div style={{ width: 36, height: 8, borderRadius: 4, background: "#2563eb" }} />
              </div>
              <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Step 2 of 2</span>
            </div>
            <button onClick={() => setWizardStep("form")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 22, padding: 4 }}>×</button>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 8px", lineHeight: 1.2 }}>Choose your plan</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>Both plans give you the same powerful tools — Pro just starts you instantly.</p>

          {/* Plan cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>

            {/* ── Free Agent ── */}
            <button
              onClick={() => { setAgentPlan("free"); setWizardStep("form"); }}
              style={{ background: "white", border: "2px solid #e2e8f0", borderRadius: 20, padding: "20px 20px", textAlign: "left", cursor: "pointer", transition: "border-color .2s, box-shadow .2s", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", margin: "0 0 2px" }}>Free Agent</p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Apply now · Admin approves within 24 hrs</p>
                </div>
                <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "6px 12px" }}>
                  <p style={{ fontSize: 15, fontWeight: 900, color: "#475569", margin: 0 }}>GH₵0</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {freeFeatures.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#2563eb", fontWeight: 900 }}>✓</div>
                    <span style={{ fontSize: 13, color: "#475569" }}>{f}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fef9c3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10 }}>⏳</div>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>Pending admin approval (up to 24 hrs)</span>
                </div>
              </div>
              <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>Apply for Free →</span>
              </div>
            </button>

            {/* ── Pro Agent ── */}
            <button
              onClick={() => { setAgentPlan("pro"); setWizardStep("form"); }}
              style={{ background: "linear-gradient(135deg,#1e3a8a,#2563eb)", border: "2px solid #3b82f6", borderRadius: 20, padding: "20px 20px", textAlign: "left", cursor: "pointer", position: "relative", overflow: "hidden", boxShadow: "0 8px 28px rgba(37,99,235,0.35)" }}
            >
              {/* Recommended badge */}
              <div style={{ position: "absolute", top: 14, right: 14, background: "#fbbf24", color: "#78350f", fontSize: 10, fontWeight: 900, borderRadius: 999, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Recommended</div>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, paddingRight: 90 }}>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 900, color: "white", margin: "0 0 2px" }}>Pro Agent ⭐</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: 0 }}>Pay once · Instant activation</p>
                </div>
                <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "6px 12px", flexShrink: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 900, color: "#fbbf24", margin: 0 }}>GH₵{PRO_FEE}</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {proFeatures.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(74,222,128,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#4ade80", fontWeight: 900 }}>✓</div>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>Get Instant Access →</span>
              </div>
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
            Already an agent? <a href="/agent/dashboard" style={{ color: "#2563eb", fontWeight: 700 }}>Sign in →</a>
          </p>
        </div>
      </div>
    );
  }

  // ── Registration Form ─────────────────────────────────────────────────────
  const isPro = agentPlan === "pro";
  function goLogin() { setLeaving(true); setTimeout(() => { window.location.href = "/agent/dashboard"; }, 820); }
  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#060c1c 0%,#0d1b2e 60%,#1e1b4b 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className={`auth-container${leaving ? " active" : ""}`} style={{ position: "relative", width: "100%", maxWidth: 900, minHeight: 640, borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>

        <div className="form-panel--register" style={{ position: "absolute", inset: 0, background: "white", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "36px 36px 36px 0" }}>
          <div style={{ width: "100%", maxWidth: 420, overflowY: "auto", maxHeight: "calc(100vh - 80px)" }}>

            {/* Plan badge + back to wizard */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button onClick={() => setWizardStep("plan")} style={{ background: "none", border: "none", color: "#2563eb", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>← Change plan</button>
              <div style={{ background: isPro ? "linear-gradient(90deg,#1e3a8a,#2563eb)" : "#f1f5f9", borderRadius: 999, padding: "5px 14px" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: isPro ? "#fbbf24" : "#64748b" }}>{isPro ? "⭐ Pro Agent · GH₵" + PRO_FEE : "Free Agent"}</span>
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: isPro ? "linear-gradient(135deg,#1e3a8a,#2563eb)" : "linear-gradient(135deg,#3b82f6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "white", marginBottom: 12 }}>E</div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", margin: "0 0 3px" }}>{isPro ? "Create Pro Account" : "Apply as Free Agent"}</h1>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{isPro ? `Pay GH₵${PRO_FEE} once — activated instantly` : "Fill in your details — we review within 24 hours"}</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {error && <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, padding: "10px 12px", borderRadius: 10 }}>{error}</div>}

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Full Name <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="text" placeholder="e.g. Kwame Mensah" value={form.name} onChange={e => setField("name", e.target.value)} className={inp} /></div>

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Email <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="email" placeholder="kwame@gmail.com" value={form.email} onChange={e => setField("email", e.target.value)} className={inp} /></div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Phone <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.phone} onChange={e => setField("phone", e.target.value)} className={inp} /></div>
                <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>WhatsApp <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.whatsapp} onChange={e => setField("whatsapp", e.target.value)} className={inp} /></div>
              </div>

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Business Name <span style={{ color: "#94a3b8", fontWeight: 500 }}>(optional)</span></label>
                <input type="text" placeholder="e.g. Kwame's Data Hub" value={form.business_name} onChange={e => setField("business_name", e.target.value)} className={inp} /></div>

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>Create Password</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Password <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type={showPw ? "text" : "password"} placeholder="Min 6 characters" value={form.password} onChange={e => setField("password", e.target.value)} className={inp} style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><EyeIcon open={showPw} /></button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Confirm Password <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type={showConfirm ? "text" : "password"} placeholder="Repeat password" value={form.confirmPassword} onChange={e => setField("confirmPassword", e.target.value)} className={inp} style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowConfirm(s => !s)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><EyeIcon open={showConfirm} /></button>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{
                background: loading ? "#94a3b8" : isPro ? "linear-gradient(90deg,#1e3a8a,#2563eb)" : "linear-gradient(90deg,#3b82f6,#7c3aed)",
                color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer", marginTop: 4,
              }}>
                {loading ? (isPro ? "Opening payment…" : "Submitting…") : isPro ? `Pay GH₵${PRO_FEE} & Get Instant Access →` : "Submit Free Application →"}
              </button>

              {!isPro && (
                <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", margin: 0 }}>
                  Want instant access?{" "}
                  <button type="button" onClick={() => { setAgentPlan("pro"); }} style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", fontSize: 11, padding: 0 }}>Upgrade to Pro →</button>
                </p>
              )}
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
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: "0 0 28px", lineHeight: 1.6 }}>Welcome back! Sign in to access your dashboard, check your wallet, and manage your sales.</p>
            <button onClick={goLogin} style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 14, padding: "12px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)" }}>Sign In →</button>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 20 }}>Free or GH₵{PRO_FEE} Pro · Set your own prices</p>
          </div>
        </div>
      </div>

      <style>{`
        .overlay-panel-reg { clip-path:polygon(0 0,56% 0,62% 100%,0 100%); transition:transform 900ms cubic-bezier(.77,0,.18,1),clip-path 900ms cubic-bezier(.77,0,.18,1); }
        .auth-container.active .overlay-panel-reg { transform:translateX(100%); clip-path:polygon(38% 0,100% 0,100% 100%,44% 100%); }
        .form-panel--register { transition:opacity 450ms ease,transform 450ms ease,filter 450ms ease; }
        .auth-container.active .form-panel--register { opacity:0; transform:translateX(60px); filter:blur(6px); }
        @media (max-width:600px) {
          .overlay-panel-reg { display:none !important; }
          .mobile-login-link { display:block !important; }
          .auth-container { min-height:auto !important; border-radius:20px !important; }
          .form-panel--register { position:relative !important; padding:28px 20px !important; justify-content:flex-start !important; }
        }
      `}</style>
    </div>
  );
}
