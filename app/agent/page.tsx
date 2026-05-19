"use client";
import { useState } from "react";
import Link from "next/link";

const perks = [
  { icon: "💰", title: "Earn 80% Profit", desc: "Keep 80% of every sale's margin. The more you sell, the more you earn." },
  { icon: "🔗", title: "Unique Referral Link", desc: "Share your personal link. Every sale through it is tracked automatically." },
  { icon: "📊", title: "Live Dashboard", desc: "See your sales, commissions, and balance in real time." },
  { icon: "⚡", title: "Instant Fulfillment", desc: "Bundles are delivered automatically — no manual work needed from you." },
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
  const [form, setForm] = useState({
    name: "", email: "", phone: "", whatsapp: "", business_name: "", password: "", confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

    setLoading(true);
    try {
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
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
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
          <h1 className="text-3xl font-black text-gray-900 mb-2">Successful Registration!</h1>
          <p className="text-lg font-semibold text-green-600 mb-6">Your application has been received.</p>
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 px-6 py-6 mb-6 text-left space-y-3">
            <p className="text-gray-700 text-sm leading-relaxed">
              Hello <span className="font-bold text-gray-900">{form.name}</span>, your agent application has been submitted successfully.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed">
              Please contact the <span className="font-bold text-blue-700">Admin</span> on WhatsApp to discuss your application and get approved.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-800 text-xs font-bold uppercase tracking-wide mb-1">Important</p>
              <p className="text-amber-700 text-sm">Message the admin now — your account will be activated after approval.</p>
            </div>
          </div>
          <a
            href={`https://wa.me/233509794503?text=${encodeURIComponent(`Hello Admin, I just registered as an Elite Data agent. My name is ${form.name} and my email is ${form.email}. Please review my application. Thank you.`)}`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-3 w-full bg-green-500 hover:bg-green-600 text-white font-black px-6 py-4 rounded-2xl text-base transition-colors shadow-lg mb-4"
          >
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
            </svg>
            Contact Admin on WhatsApp Now
          </a>
          <p className="text-xs text-gray-400 mb-6">+233 509 794 503</p>
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
          <h1 className="text-4xl font-black mb-3">Earn Money Selling Data Bundles</h1>
          <p className="text-blue-100 text-lg mb-6">Join Elite Data as an agent. Share your link, make sales, earn 80% of every profit.</p>
          <a href="#apply" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-3.5 rounded-xl text-lg transition-colors shadow-lg inline-block">
            Apply Now — It&apos;s Free
          </a>
        </div>
      </section>

      {/* Perks */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-black text-gray-800 text-center mb-8">Why Become an Agent?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {perks.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <div className="text-4xl mb-3">{p.icon}</div>
                <h3 className="font-bold text-gray-800 mb-2">{p.title}</h3>
                <p className="text-gray-500 text-sm">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission Example */}
      <section className="py-10 px-4">
        <div className="max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <h3 className="font-black text-blue-800 text-lg mb-3">How Your Earnings Work</h3>
          <p className="text-blue-700 text-sm mb-3">Example: Customer buys MTN 2GB at GH₵12</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Sale Price</span><span className="font-bold">GH₵12.00</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Fulfillment Cost</span><span className="font-bold text-red-500">-GH₵7.50</span></div>
            <div className="border-t border-blue-200 pt-2 flex justify-between"><span className="text-gray-600">Gross Profit</span><span className="font-bold">GH₵4.50</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Admin Commission (20%)</span><span className="text-gray-500">-GH₵0.90</span></div>
            <div className="flex justify-between text-green-700 font-black text-base"><span>Your Earnings (80%)</span><span>GH₵3.60</span></div>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="py-14 px-4 bg-gray-50">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-gray-800 mb-2">Apply to Become an Agent</h2>
            <p className="text-gray-500 text-sm">We review all applications within 24 hours</p>
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
                {loading ? "Submitting..." : "Submit Application"}
              </button>
            </form>
          </div>

          <div className="mt-4 text-center text-sm text-gray-500">
            Already an agent?{" "}
            <Link href="/agent/dashboard" className="text-blue-600 font-semibold hover:underline">Log In to Dashboard</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
