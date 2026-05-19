"use client";
import { useState } from "react";
import Link from "next/link";

const perks = [
  { icon: "💰", title: "Earn 80% Profit", desc: "Keep 80% of every sale's margin. The more you sell, the more you earn." },
  { icon: "🔗", title: "Unique Referral Link", desc: "Share your personal link. Every sale through it is tracked automatically." },
  { icon: "📊", title: "Live Dashboard", desc: "See your sales, commissions, and balance in real time." },
  { icon: "⚡", title: "Instant Fulfillment", desc: "Bundles are delivered automatically — no manual work needed from you." },
];

export default function AgentPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", whatsapp: "", business_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      return setError("Name, email, and phone number are required.");
    }
    if (!form.email.includes("@")) return setError("Enter a valid email address.");

    setLoading(true);
    try {
      const res = await fetch("/api/agents/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-3">Application Submitted!</h2>
        <p className="text-gray-500 mb-6">
          Thank you <span className="font-bold">{form.name}</span>! We have received your application and will review it within 24 hours.
          You will be contacted at <span className="font-bold">{form.email}</span>.
        </p>
        <Link href="/" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors inline-block text-sm">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-500 text-white py-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block bg-white/20 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
            Agent Programme
          </span>
          <h1 className="text-4xl font-black mb-3">Earn Money Selling Data Bundles</h1>
          <p className="text-blue-100 text-lg mb-6">
            Join Elite Data as an agent. Share your link, make sales, earn 80% of every profit.
          </p>
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
                <label className="block text-xs font-semibold text-gray-600 mb-1">WhatsApp Number <span className="text-gray-400">(optional)</span></label>
                <input type="tel" placeholder="0241234567" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Business / Brand Name <span className="text-gray-400">(optional)</span></label>
                <input type="text" placeholder="e.g. Kwame's Data Hub" value={form.business_name} onChange={(e) => set("business_name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm">
                {loading ? "Submitting..." : "Submit Application"}
              </button>
            </form>
          </div>

          <div className="mt-4 text-center text-sm text-gray-500">
            Already an agent?{" "}
            <Link href="/agent/dashboard" className="text-blue-600 font-semibold hover:underline">View Your Dashboard</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
