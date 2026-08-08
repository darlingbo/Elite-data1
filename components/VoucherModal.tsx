"use client";
import { useState, useEffect } from "react";

interface VoucherType {
  id: "BECE" | "WASSCE";
  label: string;
  description: string;
  sellPrice: number;
  color: string;
  bg: string;
  emoji: string;
}

const VOUCHERS: VoucherType[] = [
  { id: "BECE",   label: "BECE",   description: "Basic Education Certificate Examination",         sellPrice: 18, color: "#1d4ed8", bg: "#eff6ff", emoji: "📗" },
  { id: "WASSCE", label: "WASSCE", description: "West African Senior School Certificate Examination", sellPrice: 18, color: "#7c3aed", bg: "#f5f3ff", emoji: "📘" },
];

const PLATFORM_FEE_RATE = 0.02;

function usePaystackReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.PaystackPop) { setReady(true); return; }
    const existing = document.querySelector('script[src*="paystack"]');
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.async = true;
      s.onload = () => setReady(true);
      document.body.appendChild(s);
    } else {
      const id = setInterval(() => { if (window.PaystackPop) { setReady(true); clearInterval(id); } }, 100);
      return () => clearInterval(id);
    }
  }, []);
  return ready;
}

interface Props { onClose: () => void; agentCode?: string; }

export default function VoucherModal({ onClose, agentCode }: Props) {
  const [step, setStep] = useState<"pick" | "checkout">("pick");
  const [selected, setSelected] = useState<VoucherType>(VOUCHERS[0]);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ reference: string } | null>(null);
  const [agentPrices, setAgentPrices] = useState<Record<string, number>>({});
  const paystackReady = usePaystackReady();

  useEffect(() => {
    if (!agentCode) return;
    fetch(`/api/vouchers/prices?agent=${encodeURIComponent(agentCode)}`)
      .then(response => response.json())
      .then(data => setAgentPrices({ BECE: Number(data.BECE?.sellPrice), WASSCE: Number(data.WASSCE?.sellPrice) }))
      .catch(() => {});
  }, [agentCode]);

  const unitPrice = Number.isFinite(agentPrices[selected.id]) ? agentPrices[selected.id] : selected.sellPrice;
  const totalSell = unitPrice * quantity;
  const fee = parseFloat((totalSell * PLATFORM_FEE_RATE).toFixed(2));
  const total = parseFloat((totalSell + fee).toFixed(2));

  function handlePay() {
    setError("");
    const cleaned = phone.replace(/\s/g, "");
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) return setError("Enter a valid Ghana phone number (e.g. 0241234567).");
    if (!paystackReady) return setError("Payment is still loading. Try again in a moment.");

    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) return setError("Paystack key missing.");

    // Use phone-based email so Paystack receipt goes somewhere sensible
    const payEmail = `${cleaned}@voucher.elitedata.com`;

    setLoading(true);
    try {
      const handler = window.PaystackPop.setup({
        key,
        email: payEmail,
        amount: Math.round(total * 100),
        currency: "GHS",
        ref: `elite-vch-${Date.now()}`,
        metadata: {
          custom_fields: [
            { display_name: "Phone", variable_name: "phone", value: cleaned },
            { display_name: "Voucher", variable_name: "voucher", value: `${selected.label} x${quantity}` },
            { display_name: "Voucher Type", variable_name: "voucher_type", value: selected.id },
            { display_name: "Voucher Quantity", variable_name: "voucher_quantity", value: String(quantity) },
            { display_name: "Agent", variable_name: "agent_code", value: agentCode ?? "" },
          ],
        },
        callback: (response: { reference: string }) => {
          fetch("/api/vouchers/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Customer",
              email: payEmail,
              phone: cleaned,
              voucherType: selected.id,
              quantity,
              paystackRef: response.reference,
              agentCode: agentCode ?? null,
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              setLoading(false);
              if (data.success) setSuccess({ reference: data.reference });
              else setError(data.error || "Something went wrong. Contact support.");
            })
            .catch(() => { setLoading(false); setError("Network error. Contact support on WhatsApp."); });
        },
        onClose: () => setLoading(false),
      });
      handler.openIframe();
    } catch (err) {
      setLoading(false);
      setError(`Paystack error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">Voucher Purchased!</h2>
          <p className="text-gray-500 text-sm mb-4">
            Your <span className="font-bold">{selected.label} × {quantity}</span> voucher code{quantity > 1 ? "s have" : " has"} been sent via SMS to{" "}
            <span className="font-bold">{phone}</span>.
          </p>
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5">
            <p className="text-xs text-gray-400 mb-1">Order Reference</p>
            <p className="font-mono font-bold text-gray-800 text-sm break-all">{success.reference}</p>
          </div>
          <a href={`/track?ref=${encodeURIComponent(success.reference)}`}
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm mb-3">
            Track Order →
          </a>
          <button onClick={onClose} className="w-full text-gray-400 hover:text-gray-600 text-sm py-1 transition-colors">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Result Checker</p>
            <h2 className="text-xl font-black text-white">Buy Voucher</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === "pick" ? (
            <>
              {/* Voucher type selection */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Select Voucher Type</p>
                <div className="grid grid-cols-2 gap-3">
                  {VOUCHERS.map((v) => (
                    <button key={v.id} onClick={() => setSelected(v)}
                      className="rounded-xl p-4 border-2 text-left transition-all"
                      style={{ borderColor: selected.id === v.id ? v.color : "#e5e7eb", background: selected.id === v.id ? v.bg : "#fff" }}>
                      <span className="text-2xl block mb-1">{v.emoji}</span>
                      <p className="font-black text-gray-800 text-sm">{v.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{v.description}</p>
                      <p className="font-black mt-2 text-sm" style={{ color: v.color }}>GH₵{(Number.isFinite(agentPrices[v.id]) ? agentPrices[v.id] : v.sellPrice).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Quantity (1–10)</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg">−</button>
                  <span className="text-2xl font-black text-gray-800 w-8 text-center">{quantity}</span>
                  <button onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    className="w-10 h-10 rounded-xl border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg">+</button>
                  <div className="flex-1 bg-gray-50 rounded-xl px-4 py-2.5 text-right">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-black text-gray-800">GH₵{totalSell.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <button onClick={() => setStep("checkout")}
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-colors"
                style={{ background: `linear-gradient(90deg,${selected.color},#8b5cf6)` }}>
                Continue →
              </button>
            </>
          ) : (
            <>
              {/* Order summary */}
              <div className="rounded-xl p-3 border border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Voucher</p>
                  <p className="font-bold text-gray-800 text-sm">{selected.label} × {quantity}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Total (incl. 2% fee)</p>
                  <p className="font-black text-gray-800">GH₵{total.toFixed(2)}</p>
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Phone Number <span className="text-gray-400">(voucher sent here via SMS)</span>
                </label>
                <input type="tel" placeholder="0241234567" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                Voucher codes are delivered instantly via SMS after payment.
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setStep("pick"); setError(""); }}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-600 text-sm border border-gray-300 hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button onClick={handlePay} disabled={loading || !paystackReady}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm transition-colors disabled:opacity-60"
                  style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>
                  {loading ? "Processing…" : !paystackReady ? "Loading…" : `Pay GH₵${total.toFixed(2)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
