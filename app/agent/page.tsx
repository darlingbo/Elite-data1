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
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.whatsapp.trim()) {
      return setError("Name, email, phone, and WhatsApp number are all required.");
    }
    if (!form.email.includes("@")) return setError("Enter a valid email address.");

    if (!form.whatsapp.trim()) {
      return setError("WhatsApp number is required — it becomes your customer helpline.");
    }

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
        <p className="text-gray-500 mb-4">
          Thank you <span className="font-bold">{form.name}</span>! Your application is being processed.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-4 mb-6 text-left">
          <p className="text-sm font-bold text-blue-800 mb-1">Next step — Contact the admin for approval:</p>
          <p className="text-sm text-blue-700 mb-3">Send a WhatsApp message to introduce yourself and confirm your application.</p>
          <a
            href={`https://wa.me/233509794503?text=${encodeURIComponent(`Hi, I just applied to become an Elite Data agent. My name is ${form.name}.`)}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors shadow"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
            Chat with Admin on WhatsApp
          </a>
        </div>
        <Link href="/" className="text-blue-600 hover:underline text-sm font-semibold">
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
