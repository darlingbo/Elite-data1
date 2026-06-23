"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

const CHECK = (
  <svg className="w-4 h-4 shrink-0 text-current" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const freePlanFeatures = [
  "Your own personal store link",
  "Automated payments & delivery",
  "Reduced bundle prices",
  "Earn commission on every sale",
];

const proPlanFeatures = [
  "Everything in Free Agent",
  "Even cheaper wholesale prices",
  "Set your own profit margins",
  "Instant activation — no waiting",
];

type Plan = "free" | "pro";

export default function AgentPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>("pro");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", whatsapp: "", business_name: "", password: "", confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Plan | null>(null);

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
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function validate() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.whatsapp.trim())
      return "Name, email, phone, and WhatsApp are all required.";
    if (!form.email.includes("@")) return "Enter a valid email address.";
    if (!form.password) return "Please create a password for your account.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    return null;
  }

  async function submitApplication(paystackRef?: string) {
    const res = await fetch("/api/agents/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp,
        business_name: form.business_name,
        password: form.password,
        plan,
        paystackRef,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      // Only redirect to dashboard automatically for Pro (instantly approved)
      // Free agents are pending — don't redirect them yet
      if (plan === "pro") {
        try { localStorage.setItem("elite_agent_applied", "true"); } catch {}
      }
      setSuccess(plan);
    } else {
      setError(data.error || "Registration failed. Contact support on WhatsApp.");
    }
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) return setError(err);

    setLoading(true);

    if (plan === "free") {
      await submitApplication();
      return;
    }

    // Pro — trigger Paystack
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ps = (window as any).PaystackPop;
    if (!ps) { setLoading(false); return setError("Payment not ready yet. Please wait a moment and try again."); }

    try {
      const handler = ps.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email: form.email,
        amount: 5000, // GH₵50 in pesewas
        currency: "GHS",
        label: "Elite Data Pro Agent Registration",
        callback: (response: { reference: string }) => submitApplication(response.reference),
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) {
      setLoading(false);
      setError(`Payment error: ${String(err)}`);
    }
  }

  // ── Success screens ──────────────────────────────────────────────────────────
  if (success === "pro") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">You&apos;re a Pro Agent! ⚡</h1>
          <p className="text-lg font-semibold text-purple-600 mb-6">Your account is active — log in now and start selling.</p>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-6 py-6 mb-6 text-left space-y-4">
            <p className="text-gray-700 text-sm leading-relaxed">
              Welcome <span className="font-bold text-gray-900">{form.name}</span>! Your GH₵50 Pro registration fee has been received and your account is fully active.
            </p>
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">What to do next:</p>
              {[
                "Log in to your dashboard using your email and password",
                "Go to Wallet → Top Up to fund your account",
                "Go to My Prices → set your selling prices for each bundle",
                "Share your shop link with customers and start earning!",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                  <p className="text-sm text-gray-700">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <Link href="/agent/dashboard" className="flex items-center justify-center gap-2 w-full bg-purple-600 hover:bg-purple-700 text-white font-black px-6 py-4 rounded-2xl text-base transition-colors shadow-lg mb-4">
            Go to My Dashboard →
          </Link>
          <Link href="/" className="text-purple-600 hover:underline text-sm font-semibold">Back to Home</Link>
        </div>
      </div>
    );
  }

  if (success === "free") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">Application Submitted! 🎉</h1>
          <p className="text-lg font-semibold text-green-600 mb-6">Your application is under review — we&apos;ll activate your account shortly.</p>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-6 py-6 mb-6 text-left space-y-4">
            <p className="text-gray-700 text-sm leading-relaxed">
              Thank you <span className="font-bold text-gray-900">{form.name}</span>! Your Free Agent application has been received. Admin will review and approve your account, usually within 24 hours.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-amber-800 text-sm font-semibold mb-1">Want instant access?</p>
              <p className="text-amber-700 text-xs leading-relaxed">Upgrade to Pro Agent for GH₵50 and get activated immediately — no waiting.</p>
              <button onClick={() => { setSuccess(null); setPlan("pro"); }} className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg text-sm transition-colors">
                Upgrade to Pro Agent ⚡
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center">You&apos;ll receive a WhatsApp message once your account is approved.</p>
          </div>
          <Link href="/" className="text-green-600 hover:underline text-sm font-semibold">Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── Main page ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-500 text-white py-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block bg-white/20 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Agent Programme</span>
          <h1 className="text-4xl font-black mb-3">Start Your Own Data Bundle Business</h1>
          <p className="text-blue-100 text-lg mb-6">Set your own prices, build your customer base, keep all your profit. Choose the plan that suits you.</p>
          <a href="#apply" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-3.5 rounded-xl text-lg transition-colors shadow-lg inline-block">
            Get Started Today
          </a>
        </div>
      </section>

      {/* Plan Cards */}
      <section id="apply" className="py-14 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">

          {/* Register / Login toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden mb-10 shadow-sm max-w-lg mx-auto">
            <div className="flex-1 py-3 text-center text-sm font-black text-blue-600 bg-blue-50 border-b-2 border-blue-600">Register</div>
            <Link href="/agent/dashboard" className="flex-1 py-3 text-center text-sm font-semibold text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-colors">
              Login to Dashboard
            </Link>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-gray-800 mb-2">Choose Your Agent Plan</h2>
            <p className="text-gray-500 text-sm">Pick the plan that works for you — you can always upgrade later</p>
          </div>

          {/* Plan comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
            {/* Free Plan */}
            <button type="button" onClick={() => setPlan("free")}
              className={`text-left rounded-2xl border-2 p-6 transition-all cursor-pointer ${plan === "free" ? "border-green-500 bg-green-50 shadow-md" : "border-gray-200 bg-white hover:border-green-300"}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-black text-gray-800">Free Agent</span>
                {plan === "free" && <span className="text-xs font-bold bg-green-500 text-white px-2 py-0.5 rounded-full">Selected</span>}
              </div>
              <p className="text-3xl font-black text-green-600 mb-1">Free</p>
              <p className="text-xs text-gray-400 mb-4">No registration fee</p>
              <ul className="space-y-2">
                {freePlanFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5">{CHECK}</span>{f}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⏳ Awaits admin approval
              </p>
            </button>

            {/* Pro Plan */}
            <button type="button" onClick={() => setPlan("pro")}
              className={`text-left rounded-2xl border-2 p-6 transition-all cursor-pointer relative ${plan === "pro" ? "border-purple-500 bg-purple-50 shadow-md" : "border-gray-200 bg-white hover:border-purple-300"}`}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-purple-600 text-white text-xs font-black px-3 py-1 rounded-full shadow">Most Popular</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-black text-gray-800">Pro Agent</span>
                {plan === "pro" && <span className="text-xs font-bold bg-purple-600 text-white px-2 py-0.5 rounded-full">Selected</span>}
              </div>
              <p className="text-3xl font-black text-purple-600 mb-1">GH₵50</p>
              <p className="text-xs text-gray-400 mb-4">One-time fee · lifetime access</p>
              <ul className="space-y-2">
                {proPlanFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-purple-500 mt-0.5">{CHECK}</span>{f}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-purple-700 font-semibold bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                ⚡ Instant activation after payment
              </p>
            </button>
          </div>

          {/* Registration Form */}
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-6">
              <h3 className="text-xl font-black text-gray-800 mb-1">
                {plan === "pro" ? "Create Your Pro Agent Account" : "Apply for a Free Agent Account"}
              </h3>
              <p className="text-gray-500 text-sm">
                {plan === "pro" ? "Pay GH₵50 once — account activated instantly, no waiting" : "Apply free — admin will review and approve your account"}
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" placeholder="e.g. Kwame Mensah" value={form.name} onChange={(e) => set("name", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address <span className="text-red-400">*</span></label>
                  <input type="email" placeholder="kwame@gmail.com" value={form.email} onChange={(e) => set("email", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number <span className="text-red-400">*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">WhatsApp Number <span className="text-red-400">*</span></label>
                  <input type="tel" placeholder="0241234567" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">This becomes your customers&apos; helpline when they buy through your link.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Business / Brand Name <span className="text-gray-400">(optional)</span></label>
                  <input type="text" placeholder="e.g. Kwame's Data Hub" value={form.business_name} onChange={(e) => set("business_name", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Create Your Account Password</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Password <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <input type={showPw ? "text" : "password"} placeholder="Minimum 6 characters" value={form.password} onChange={(e) => set("password", e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                        <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <EyeIcon open={showPw} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Confirm Password <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <input type={showConfirm ? "text" : "password"} placeholder="Repeat your password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10" />
                        <button type="button" onClick={() => setShowConfirm((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <EyeIcon open={showConfirm} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">You will use this password to log into your agent dashboard.</p>
                </div>

                <button type="submit" disabled={loading}
                  className={`w-full disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm ${plan === "pro" ? "bg-purple-600 hover:bg-purple-700" : "bg-green-600 hover:bg-green-700"}`}>
                  {loading
                    ? plan === "pro" ? "Opening payment…" : "Submitting…"
                    : plan === "pro" ? "Pay GH₵50 & Activate Instantly ⚡" : "Apply for Free Agent Account"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black text-gray-800 mb-2">How It Works</h2>
            <p className="text-gray-500">Simple steps to start earning</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black flex items-center justify-center shrink-0">1</div>
                <h3 className="font-black text-gray-800">Register Your Account</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">Choose Free or Pro. Pro agents are activated instantly after the GH₵50 payment. Free agents await admin approval (usually within 24 hours).</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-green-600 text-white font-black flex items-center justify-center shrink-0">2</div>
                <h3 className="font-black text-gray-800">Top Up Your Wallet</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">Go to <strong>Wallet → Add Funds</strong> and top up via Paystack. This is your buying power — each sale deducts the bundle&apos;s base cost automatically.</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-purple-600 text-white font-black flex items-center justify-center shrink-0">3</div>
                <h3 className="font-black text-gray-800">Set Your Selling Prices (Pro)</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">Pro agents go to <strong>My Prices</strong> and set prices above the admin base. That markup is 100% yours. Free agents earn a fixed commission on every sale.</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-amber-500 text-white font-black flex items-center justify-center shrink-0">4</div>
                <h3 className="font-black text-gray-800">Share Your Shop & Earn</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">Share your personal shop link on WhatsApp and social media. Customers buy, data is delivered automatically, and your profit is recorded instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Earnings example */}
      <section className="py-10 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-gray-800 text-center mb-6">How Your Earnings Work</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Free agent earnings */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm font-black text-green-600 mb-3 uppercase tracking-wide">Free Agent</p>
              <p className="text-gray-500 text-xs mb-4">You earn a commission on every completed sale.</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Customer pays</span><span className="font-bold">GH₵10.00</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Your commission</span><span className="font-bold text-green-600">+GH₵1.00</span></div>
                <div className="border-t border-gray-100 pt-2 flex justify-between text-green-700 font-black text-sm"><span>You earn</span><span>GH₵1.00 ✅</span></div>
              </div>
            </div>
            {/* Pro agent earnings */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm font-black text-purple-600 mb-3 uppercase tracking-wide">Pro Agent</p>
              <p className="text-gray-500 text-xs mb-4">You set your own price. Example: MTN 2GB base = GH₵10, you sell at GH₵13.</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Customer pays</span><span className="font-bold">GH₵13.00</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Deducted from wallet</span><span className="font-bold text-red-500">−GH₵10.00</span></div>
                <div className="border-t border-gray-100 pt-2 flex justify-between text-green-700 font-black text-sm"><span>Your profit</span><span>GH₵3.00 ✅</span></div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4 text-center">No limits on how much you can make. The more you sell, the more you earn.</p>
        </div>
      </section>
    </div>
  );
}
