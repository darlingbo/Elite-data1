"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";


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
  const [form, setForm] = useState({
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
    // Load Paystack script
    if (!document.querySelector('script[src*="paystack"]')) {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, [router]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.whatsapp.trim()) {
      return setError("Name, email, phone, and WhatsApp number are all required.");
    }
    if (!form.email.includes("@")) return setError("Enter a valid email address.");
    if (!form.password) return setError("Please create a password for your account.");
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
        amount: 4000, // GH₵40 in pesewas
        currency: "GHS",
        label: "Elite Data Agent Registration Fee",
        callback: (response: { reference: string }) => {
          fetch("/api/agents/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name,
              email: form.email,
              phone: form.phone,
              whatsapp: form.whatsapp,
              business_name: form.business_name,
              password: form.password,
              agent_type: "custom_price",
              paystackRef: response.reference,
            }),
          })
            .then(r => r.json())
            .then(data => {
              setLoading(false);
              if (data.success) {
                try { localStorage.setItem("elite_agent_applied", "true"); } catch {}
                setSuccess(true);
              } else {
                setError(data.error || "Registration failed. Contact support on WhatsApp.");
              }
            })
            .catch(() => { setLoading(false); setError("Network error. Contact support on WhatsApp."); });
        },
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) {
      setLoading(false);
      setError(`Payment error: ${String(err)}`);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">You&apos;re Approved! 🎉</h1>
          <p className="text-lg font-semibold text-green-600 mb-6">Your account is active — log in now and start selling.</p>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-6 py-6 mb-6 text-left space-y-4">
            <p className="text-gray-700 text-sm leading-relaxed">
              Welcome <span className="font-bold text-gray-900">{form.name}</span>! Your GH₵40 registration fee has been received and your agent account is now fully active.
            </p>
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">What to do next:</p>
              {[
                { step: "1", text: "Log in to your dashboard using your email and password" },
                { step: "2", text: "Go to Wallet → Top Up to fund your account" },
                { step: "3", text: "Go to My Prices → set your selling prices for each bundle" },
                { step: "4", text: "Share your shop link with customers and start earning!" },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                  <p className="text-sm text-gray-700">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
          <a href="/agent/dashboard"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-4 rounded-2xl text-base transition-colors shadow-lg mb-4">
            Go to My Dashboard →
          </a>
          <a href="/" className="text-blue-600 hover:underline text-sm font-semibold">Back to Home</a>
        </div>
      </div>
    );
  }

  const [leaving, setLeaving] = useState(false);
  function goLogin() {
    setLeaving(true);
    setTimeout(() => { window.location.href = "/agent/dashboard"; }, 820);
  }

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#060c1c 0%,#0d1b2e 60%,#1e1b4b 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>

      {/* ── Split-panel auth container ── */}
      <div className={`auth-container${leaving ? " active" : ""}`} style={{ position: "relative", width: "100%", maxWidth: 900, minHeight: 640, borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>

        {/* Form panel — register (right side on desktop, full on mobile) */}
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
                <input type="text" placeholder="e.g. Kwame Mensah" value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></div>

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Email <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="email" placeholder="kwame@gmail.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} /></div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Phone <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inp} /></div>
                <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>WhatsApp <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className={inp} /></div>
              </div>

              <div><label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Business Name <span style={{ color: "#94a3b8", fontWeight: 500 }}>(optional)</span></label>
                <input type="text" placeholder="e.g. Kwame's Data Hub" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} className={inp} /></div>

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>Create Password</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Password <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type={showPw ? "text" : "password"} placeholder="Min 6 characters" value={form.password} onChange={(e) => set("password", e.target.value)} className={inp} style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><EyeIcon open={showPw} /></button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Confirm Password <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type={showConfirm ? "text" : "password"} placeholder="Repeat password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} className={inp} style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowConfirm(s => !s)} style={{ position: "absolute", right: 10, bottom: 9, background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><EyeIcon open={showConfirm} /></button>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{ background: loading ? "#94a3b8" : "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}>
                {loading ? "Opening payment…" : "Pay GH₵40 & Activate →"}
              </button>
            </form>

            {/* Mobile-only login link */}
            <p className="mobile-login-link" style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 18, display: "none" }}>
              Already an agent? <a href="/agent/dashboard" style={{ color: "#3b82f6", fontWeight: 700 }}>Sign in →</a>
            </p>
          </div>
        </div>

        {/* Overlay panel — starts on LEFT, slides right on .active */}
        <div className="overlay-panel-reg" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#7c3aed 0%,#1d4ed8 60%,#0369a1 100%)", display: "flex", alignItems: "center", justifyContent: "flex-start", padding: "40px 48px" }}>
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
          clip-path: polygon(0 0, 86% 0, 100% 100%, 0 100%);
          transition: transform 900ms cubic-bezier(.77,0,.18,1), clip-path 900ms cubic-bezier(.77,0,.18,1);
        }
        .auth-container.active .overlay-panel-reg {
          transform: translateX(100%);
          clip-path: polygon(14% 0, 100% 0, 100% 100%, 0 100%);
        }
        .form-panel--register {
          transition: opacity 450ms ease, transform 450ms ease, filter 450ms ease;
        }
        .auth-container.active .form-panel--register {
          opacity: 0;
          transform: translateX(80px);
          filter: blur(6px);
        }
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
