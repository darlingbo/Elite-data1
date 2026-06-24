"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const perks = [
  { icon: "🏷️", title: "Set Your Own Prices", desc: "You decide what to charge customers. Add any markup you want above the admin base price." },
  { icon: "💳", title: "Wallet-Based System", desc: "Top up your wallet, each sale deducts the base cost, you keep the difference as profit." },
  { icon: "🔗", title: "Your Own Shop Link", desc: "Get a personal shop page and link. Customers buy from your shop at your prices." },
  { icon: "💰", title: "Withdraw Anytime", desc: "Your profits + Paystack deposits are always withdrawable to your MoMo." },
];

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
          <Link href="/agent/dashboard"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-4 rounded-2xl text-base transition-colors shadow-lg mb-4">
            Go to My Dashboard →
          </Link>
          <Link href="/" className="text-blue-600 hover:underline text-sm font-semibold">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-500 text-white py-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block bg-white/20 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">Agent Programme</span>
          <h1 className="text-4xl font-black mb-3">Start Your Own Data Bundle Business</h1>
          <p className="text-blue-100 text-lg mb-6">Set your own prices, build your own customer base, keep all your profit. Pay once — sell forever.</p>
          <a href="#apply" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-3.5 rounded-xl text-lg transition-colors shadow-lg inline-block">
            Register Now — GH₵40 One-Time Fee
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black text-gray-800 mb-2">How It Works</h2>
            <p className="text-gray-500">Everything you need to know before registering</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1 */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black flex items-center justify-center shrink-0">1</div>
                <h3 className="font-black text-gray-800">Pay GH₵40 Registration Fee</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">Pay once via Paystack and your account is instantly approved — no waiting, no manual review. This fee gives you lifetime access to the agent platform.</p>
            </div>
            {/* Step 2 */}
            <div className="bg-green-50 border border-green-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-green-600 text-white font-black flex items-center justify-center shrink-0">2</div>
                <h3 className="font-black text-gray-800">Top Up Your Wallet</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">After logging in, go to <strong>Wallet → Add Funds</strong> and top up via Paystack. This is your buying power — each sale deducts the bundle&apos;s base cost from your wallet automatically.</p>
            </div>
            {/* Step 3 */}
            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-purple-600 text-white font-black flex items-center justify-center shrink-0">3</div>
                <h3 className="font-black text-gray-800">Set Your Own Selling Prices</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">Go to <strong>My Prices</strong> and set the price you want to charge customers for each bundle. You add your markup on top of the admin base price — that markup is 100% yours.</p>
            </div>
            {/* Step 4 */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-amber-500 text-white font-black flex items-center justify-center shrink-0">4</div>
                <h3 className="font-black text-gray-800">Share Your Shop & Earn</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">You get a personal shop link (e.g. <strong>elitedata1.com/shop/YOURCODE</strong>). Share it on WhatsApp, social media, or anywhere. Customers buy at your price — data is delivered automatically, your profit is recorded instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Earnings example */}
      <section className="py-10 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-gray-800 text-center mb-6">How Your Earnings Work</h2>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <p className="text-gray-500 text-sm mb-4 text-center">Example: Admin base price for MTN 2GB = <strong>GH₵10</strong>. You sell at <strong>GH₵13</strong>.</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Customer pays</span><span className="font-bold">GH₵13.00</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Deducted from your wallet</span><span className="font-bold text-red-500">−GH₵10.00</span></div>
              <div className="border-t border-gray-100 pt-2 flex justify-between text-green-700 font-black text-base"><span>Your profit</span><span>GH₵3.00 ✅</span></div>
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">The more you sell, the more you earn. No limits on how much you can make.</p>
          </div>

          {/* Wallet & Withdrawal */}
          <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-black text-gray-800 mb-3">Wallet &amp; Withdrawals</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>💳 <strong>Wallet balance</strong> — used to fund deliveries. Top up via Paystack anytime.</p>
              <p>💰 <strong>Profit balance</strong> — your earnings from sales. Always withdrawable.</p>
              <p>📤 <strong>Withdraw to MoMo</strong> — go to Wallet → Withdraw. Minimum GH₵50. Sent instantly via Paystack to your MTN MoMo, Telecel Cash, or AirtelTigo.</p>
              <p>⚠️ <strong>Note:</strong> Only Paystack top-ups are withdrawable as wallet funds. Admin manual credits are for buying power only.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-black text-gray-800 text-center mb-8">Why Join Elite Data?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {perks.map((p) => (
              <div key={p.title} className="bg-gray-50 rounded-2xl p-6 shadow-sm text-center">
                <div className="text-4xl mb-3">{p.icon}</div>
                <h3 className="font-bold text-gray-800 mb-2">{p.title}</h3>
                <p className="text-gray-500 text-sm">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="py-14 px-4 bg-gray-50">
        <div className="max-w-lg mx-auto">
          {/* Register / Login toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden mb-8 shadow-sm">
            <div className="flex-1 py-3 text-center text-sm font-black text-blue-600 bg-blue-50 border-b-2 border-blue-600">
              Register
            </div>
            <Link href="/agent/dashboard"
              className="flex-1 py-3 text-center text-sm font-semibold text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-colors">
              Login to Dashboard
            </Link>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-gray-800 mb-2">Create Your Agent Account</h2>
            <p className="text-gray-500 text-sm">Pay GH₵40 once — account activated instantly, no waiting</p>
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

              {/* Password */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Create Your Account Password</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Password <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        placeholder="Minimum 6 characters"
                        value={form.password}
                        onChange={(e) => set("password", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                      />
                      <button type="button" onClick={() => setShowPw((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <EyeIcon open={showPw} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Confirm Password <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repeat your password"
                        value={form.confirmPassword}
                        onChange={(e) => set("confirmPassword", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                      />
                      <button type="button" onClick={() => setShowConfirm((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <EyeIcon open={showConfirm} />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">You will use this password to log into your agent dashboard.</p>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm">
                {loading ? "Opening payment…" : "Pay GH₵40 & Activate Account"}
              </button>
            </form>
          </div>

        </div>
      </section>
    </div>
  );
}
