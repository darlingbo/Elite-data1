"use client";
import { useState } from "react";
import { Bundle, networkConfig } from "@/lib/bundles";

interface Props {
  bundle: Bundle;
  agentCode?: string;
  onClose: () => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PaystackPop: any;
  }
}

export default function CheckoutModal({ bundle, agentCode, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ reference: string } | null>(null);

  const net = networkConfig[bundle.network];

  function validatePhone(p: string) {
    return /^0[2-5][0-9]{8}$/.test(p.replace(/\s/g, ""));
  }

  function handlePay() {
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!email.trim() || !email.includes("@")) return setError("Please enter a valid email.");
    if (!validatePhone(phone)) return setError("Enter a valid Ghana phone number (e.g. 0241234567).");

    setLoading(true);

    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email,
      amount: Math.round(bundle.price * 100),
      currency: "GHS",
      ref: `elite-${Date.now()}`,
      metadata: {
        custom_fields: [
          { display_name: "Customer Name", variable_name: "name", value: name },
          { display_name: "Phone Number", variable_name: "phone", value: phone },
          { display_name: "Bundle", variable_name: "bundle", value: `${net.name} ${bundle.size}` },
        ],
      },
      callback: async (response: { reference: string }) => {
        try {
          const res = await fetch("/api/orders/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              email,
              phone,
              bundleId: bundle.id,
              paystackRef: response.reference,
              agentCode: agentCode ?? null,
            }),
          });
          const data = await res.json();
          setLoading(false);
          if (data.success) {
            setSuccess({ reference: data.reference });
          } else {
            setError(data.error || "Something went wrong. Please contact support.");
          }
        } catch {
          setLoading(false);
          setError("Network error. Please contact support on WhatsApp.");
        }
      },
      onClose: () => {
        setLoading(false);
      },
    });

    handler.openIframe();
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
          <h2 className="text-2xl font-black text-gray-800 mb-2">Order Placed!</h2>
          <p className="text-gray-500 text-sm mb-4">
            Your <span className="font-bold">{net.name} {bundle.size}</span> bundle is being delivered to{" "}
            <span className="font-bold">{phone}</span>. This usually takes 1–5 minutes.
          </p>
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-gray-400 mb-1">Order Reference</p>
            <p className="font-mono font-bold text-gray-800 text-sm break-all">{success.reference}</p>
          </div>
          <p className="text-xs text-gray-400 mb-6">
            Save this reference to track your order. A confirmation was sent to {email}.
          </p>
          <button onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className={`${net.bgLight} rounded-t-2xl px-6 py-4 flex items-center justify-between border-b ${net.borderColor} border`}>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{net.name} Bundle</p>
            <h2 className="text-2xl font-black text-gray-800">{bundle.size}</h2>
            <p className={`text-lg font-bold ${net.textColor}`}>GH₵ {bundle.price.toFixed(2)}</p>
          </div>
          <div className={`w-14 h-14 rounded-full ${net.bgColor} flex items-center justify-center text-white font-black text-sm`}>
            {net.logo}
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
            <input type="text" placeholder="e.g. Kwame Mensah" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
            <input type="email" placeholder="e.g. kwame@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {net.name} Phone Number <span className="text-gray-400">(bundle will be sent here)</span>
            </label>
            <input type="tel" placeholder="0241234567" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
            Bundle delivered instantly after payment · Validity: {bundle.validity}
          </div>

          <button onClick={handlePay} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm">
            {loading ? "Processing..." : `Pay GH₵ ${bundle.price.toFixed(2)}`}
          </button>

          <button onClick={onClose} className="w-full text-gray-500 hover:text-gray-700 text-sm py-1 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
