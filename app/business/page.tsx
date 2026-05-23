"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Bundle, Network } from "@/lib/bundles";

const PLATFORM_FEE_RATE = 0.02;

function usePaystackReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.PaystackPop) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, []);
  return ready;
}

function parsePhones(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/\s+/g, "").replace(/^\+233/, "0").replace(/^233/, "0"))
    .filter((s) => /^0[2-5][0-9]{8}$/.test(s));
}

function networkBg(n: string) {
  if (n === "mtn") return "bg-yellow-400 text-yellow-900";
  if (n === "telecel") return "bg-red-500 text-white";
  return "bg-blue-500 text-white";
}

interface Outcome { phone: string; ref: string; status: "delivered" | "failed"; }

function BusinessContent() {
  useSearchParams(); // required for Suspense boundary

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [network, setNetwork] = useState<Network>("mtn");
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [phonesText, setPhonesText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ delivered: number; failed: number; total: number; outcomes: Outcome[] } | null>(null);

  const paystackReady = usePaystackReady();

  useEffect(() => {
    fetch("/api/bundles")
      .then((r) => r.json())
      .then((d) => setBundles(d.bundles ?? []));
  }, []);

  const validPhones = parsePhones(phonesText);
  const uniquePhones = [...new Set(validPhones)];
  const allLines = phonesText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const invalidCount = allLines.length - uniquePhones.length;

  const filtered = bundles
    .filter((b) => b.network === network)
    .sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));

  const unitTotal = selectedBundle ? parseFloat((selectedBundle.price * (1 + PLATFORM_FEE_RATE)).toFixed(2)) : 0;
  const grandTotal = parseFloat((unitTotal * uniquePhones.length).toFixed(2));
  const platformFee = parseFloat((selectedBundle ? selectedBundle.price * PLATFORM_FEE_RATE * uniquePhones.length : 0).toFixed(2));

  function handlePay() {
    if (!selectedBundle || uniquePhones.length < 2) return;
    if (!contactPhone.trim()) { setError("Enter your contact phone number."); return; }
    setError("");
    setLoading(true);

    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) { setError("Paystack key missing."); setLoading(false); return; }

    const email = `bulk-${contactPhone.replace(/\s/g, "")}@business.elitedata.com`;
    const ref = `elite-bulk-${Date.now()}`;

    try {
      const handler = window.PaystackPop.setup({
        key,
        email,
        amount: Math.round(grandTotal * 100),
        currency: "GHS",
        ref,
        callback: async (response: { reference: string }) => {
          try {
            const res = await fetch("/api/orders/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phones: uniquePhones,
                bundleId: selectedBundle.id,
                paystackRef: response.reference,
                companyName: companyName.trim() || null,
                contactPhone: contactPhone.trim(),
              }),
            });
            const d = await res.json();
            setLoading(false);
            if (d.success) setResults(d);
            else setError(d.error || "Order failed. Contact support on WhatsApp.");
          } catch {
            setLoading(false);
            setError("Network error. Contact support on WhatsApp.");
          }
        },
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) {
      setLoading(false);
      setError(`Paystack error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Results screen ──
  if (results) {
    const allOk = results.failed === 0;
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className={`p-6 text-center ${allOk ? "bg-green-50" : "bg-amber-50"}`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${allOk ? "bg-green-100" : "bg-amber-100"}`}>
              {allOk ? (
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h2 className="text-xl font-black text-gray-800 mb-1">
              {allOk ? "All Delivered!" : `${results.delivered}/${results.total} Delivered`}
            </h2>
            <p className="text-sm text-gray-500">
              {allOk
                ? `${results.total} numbers topped up successfully.`
                : `${results.failed} failed — support has been notified and will follow up.`}
            </p>
          </div>

          <div className="divide-y divide-gray-50">
            {results.outcomes.map((o) => (
              <div key={o.ref} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${o.status === "delivered" ? "bg-green-500" : "bg-red-400"}`} />
                <span className="font-mono text-sm text-gray-700 flex-1">{o.phone}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.status === "delivered" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {o.status === "delivered" ? "Delivered" : "Failed"}
                </span>
              </div>
            ))}
          </div>

          {results.failed > 0 && (
            <div className="px-5 py-4 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700 font-semibold">Failed numbers: our team has been alerted and will top them up manually or process a refund.</p>
              <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-green-700 bg-green-100 hover:bg-green-200 px-3 py-1.5 rounded-lg transition-colors">
                WhatsApp Support
              </a>
            </div>
          )}

          <div className="px-5 py-4 border-t border-gray-50">
            <button onClick={() => { setResults(null); setStep(1); setSelectedBundle(null); setPhonesText(""); setContactPhone(""); setCompanyName(""); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
              Place Another Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-16">
      {/* Header */}
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full mb-3">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Business Top-up
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-800 leading-tight">Bulk Data Top-up</h1>
        <p className="text-gray-400 text-sm mt-1.5">Top up 2–50 numbers in a single payment. Perfect for teams, churches, and schools.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-7">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${step === s ? "bg-blue-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"}`}>
              {step > s ? "✓" : s}
            </div>
            {s < 3 && <div className={`flex-1 h-0.5 w-8 ${step > s ? "bg-green-400" : "bg-gray-100"}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-gray-400 font-medium">
          {step === 1 ? "Choose bundle" : step === 2 ? "Enter numbers" : "Review & pay"}
        </span>
      </div>

      {/* ── Step 1: Choose Bundle ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-black text-gray-800 mb-4">Which bundle do you want to send?</p>

            {/* Network tabs */}
            <div className="flex gap-2 bg-gray-100 rounded-2xl p-1.5 mb-4">
              {(["mtn", "telecel", "airteltigo"] as Network[]).map((n) => (
                <button key={n} onClick={() => setNetwork(n)}
                  className={`flex-1 py-2 px-1 rounded-xl font-bold text-xs transition-all ${network === n ? (n === "mtn" ? "bg-yellow-400 text-yellow-900" : n === "telecel" ? "bg-red-500 text-white" : "bg-blue-500 text-white") + " shadow-sm" : "text-gray-500"}`}>
                  {n === "mtn" ? "MTN" : n === "telecel" ? "Telecel" : "AirtelTigo"}
                </button>
              ))}
            </div>

            {/* Bundles */}
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No bundles available.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {filtered.map((b) => (
                  <button key={b.id} onClick={() => setSelectedBundle(b)}
                    className={`rounded-2xl p-3.5 text-left border-2 transition-all ${selectedBundle?.id === b.id ? "border-blue-500 bg-blue-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                    <div className={`text-xs font-black px-1.5 py-0.5 rounded-full inline-block mb-2 ${networkBg(b.network)}`}>
                      {b.network === "airteltigo" ? "AT" : b.network.toUpperCase()}
                    </div>
                    <p className="font-black text-gray-800 text-base leading-none mb-0.5">{b.size}</p>
                    <p className="font-black text-blue-600">GH₵{b.price.toFixed(2)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">per number</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setStep(2)} disabled={!selectedBundle}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl text-sm transition-colors">
            Continue — Enter Numbers →
          </button>
        </div>
      )}

      {/* ── Step 2: Enter Numbers ── */}
      {step === 2 && selectedBundle && (
        <div className="space-y-4">
          {/* Selected bundle pill */}
          <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${networkBg(selectedBundle.network)}`}>
              {selectedBundle.network === "airteltigo" ? "AT" : selectedBundle.network.toUpperCase()}
            </span>
            <span className="font-bold text-gray-800 text-sm">{selectedBundle.size}</span>
            <span className="text-blue-600 font-black text-sm">GH₵{selectedBundle.price.toFixed(2)} / number</span>
            <button onClick={() => setStep(1)} className="ml-auto text-xs text-blue-600 hover:underline font-semibold">Change</button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                Phone Numbers * <span className="text-gray-400 font-normal">(one per line, max 50)</span>
              </label>
              <textarea
                value={phonesText}
                onChange={(e) => setPhonesText(e.target.value)}
                placeholder={"0241234567\n0551234567\n0241234568\n..."}
                rows={8}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-gray-400">
                  {uniquePhones.length > 0
                    ? <span className="text-green-600 font-semibold">{uniquePhones.length} valid number{uniquePhones.length !== 1 ? "s" : ""}</span>
                    : "Paste phone numbers, one per line"}
                  {invalidCount > 0 && <span className="text-red-500 ml-2">· {invalidCount} invalid/duplicate removed</span>}
                </p>
                {uniquePhones.length >= 2 && (
                  <span className="text-xs font-bold text-blue-600">
                    Est. total: GH₵{(selectedBundle.price * (1 + PLATFORM_FEE_RATE) * uniquePhones.length).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Company / Organisation Name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. ABC Ltd, Sunrise Church, Accra High School"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">Your Contact Number * <span className="text-gray-400 font-normal">(for receipt & support)</span></label>
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                placeholder="0241234567"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="px-5 py-3 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
              ← Back
            </button>
            <button onClick={() => { if (uniquePhones.length < 2) { setError("Enter at least 2 valid phone numbers."); return; } if (!contactPhone.trim()) { setError("Enter your contact number."); return; } setError(""); setStep(3); }}
              disabled={uniquePhones.length < 2}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-sm transition-colors">
              Review Order →
            </button>
          </div>
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>
      )}

      {/* ── Step 3: Review & Pay ── */}
      {step === 3 && selectedBundle && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="font-black text-gray-800">Order Summary</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Bundle</span>
                <span className="font-bold text-gray-800">
                  {selectedBundle.network === "airteltigo" ? "AirtelTigo" : selectedBundle.network.toUpperCase()} {selectedBundle.size}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Numbers</span>
                <span className="font-bold text-gray-800">{uniquePhones.length} phone{uniquePhones.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Price per number</span>
                <span className="font-bold text-gray-800">GH₵{selectedBundle.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Platform fee (2%)</span>
                <span className="font-bold text-gray-800">GH₵{platformFee.toFixed(2)}</span>
              </div>
              {companyName && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Company</span>
                  <span className="font-bold text-gray-800">{companyName}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Contact</span>
                <span className="font-bold text-gray-800">{contactPhone}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <span className="font-black text-gray-800">Total</span>
                <span className="font-black text-blue-600 text-lg">GH₵{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Numbers preview (collapsed) */}
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 max-h-36 overflow-y-auto">
            <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">{uniquePhones.length} Numbers</p>
            <div className="grid grid-cols-2 gap-1">
              {uniquePhones.map((p) => (
                <span key={p} className="font-mono text-xs text-gray-600">{p}</span>
              ))}
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">{error}</div>}

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            All {uniquePhones.length} numbers will be topped up immediately after payment. Failures are auto-reported to our team.
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)}
              className="px-5 py-3 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
              ← Back
            </button>
            <button onClick={handlePay} disabled={loading || !paystackReady}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-2xl text-sm transition-colors">
              {loading ? "Processing…" : !paystackReady ? "Loading…" : `Pay GH₵${grandTotal.toFixed(2)} →`}
            </button>
          </div>
        </div>
      )}

      {/* Trust strip */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { icon: "⚡", text: "Instant Top-up" },
          { icon: "🔒", text: "Secure Payment" },
          { icon: "📞", text: "WhatsApp Support" },
        ].map((item) => (
          <div key={item.text} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
            <span className="text-base">{item.icon}</span>
            <span className="text-xs font-semibold text-gray-600">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BusinessPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
      </div>
    }>
      <BusinessContent />
    </Suspense>
  );
}
