"use client";
import { useState, useEffect, useRef } from "react";
import { Bundle, networkConfig } from "@/lib/bundles";

interface Props {
  bundle: Bundle;
  agentCode?: string;
  referralVia?: string;
  onClose: () => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PaystackPop: any;
  }
}

const PLATFORM_FEE_RATE = 0.02;
const FAST_DELIVERY_FEE = 0.50;

type LoyaltyData = {
  count: number;
  total: number;
  windowEndsAt: string | null;
  rewardEarned: boolean;
};

type SuccessState = {
  reference: string;
  loyalty?: LoyaltyData;
};

function usePaystackReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.PaystackPop) { setReady(true); return; }

    const existing = document.querySelector('script[src*="paystack"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.async = true;
      script.onload = () => setReady(true);
      document.body.appendChild(script);
    } else {
      const check = setInterval(() => {
        if (window.PaystackPop) { setReady(true); clearInterval(check); }
      }, 100);
      return () => clearInterval(check);
    }
  }, []);

  return ready;
}

function timeLeft(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard?.writeText(text).then(onDone).catch(onDone);
}

export default function CheckoutModal({ bundle, agentCode, referralVia, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [referralCredit, setReferralCredit] = useState(0);
  const [creditChecked, setCreditChecked] = useState(false);
  const [milestoneCode, setMilestoneCode] = useState<string | null>(null);
  const [referralUsesLeft, setReferralUsesLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [refundPhone, setRefundPhone] = useState("");
  const [refundNetwork, setRefundNetwork] = useState("mtn");
  const [promoCode, setPromoCode] = useState("");
  const [fastDelivery, setFastDelivery] = useState(false);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoResult, setPromoResult] = useState<{ discount: number; code: string; id: string; label: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const paystackReady = usePaystackReady();
  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const net = networkConfig[bundle.network];
  const feeAmount = parseFloat((bundle.price * PLATFORM_FEE_RATE).toFixed(2));
  const baseTotal = parseFloat((bundle.price + feeAmount).toFixed(2));
  const promoDiscount = promoResult?.discount ?? 0;
  const totalAmount = parseFloat(Math.max(baseTotal - referralCredit - promoDiscount + (fastDelivery ? FAST_DELIVERY_FEE : 0), 0).toFixed(2));

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoApplying(true); setPromoError(""); setPromoResult(null);
    try {
      const r = await fetch("/api/validate-coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode.trim(), amount: baseTotal }) });
      const d = await r.json();
      if (!r.ok || !d.valid) { setPromoError(d.error ?? "Invalid code"); }
      else {
        setPromoResult({ discount: d.discount, code: d.code, id: d.id, label: d.discount_type === "percent" ? `${d.discount_value}% off` : `GH₵${d.discount_value} off` });
      }
    } catch { setPromoError("Could not check code. Try again."); }
    finally { setPromoApplying(false); }
  }

  // Check referral credits when phone is entered
  useEffect(() => {
    const cleaned = phone.replace(/\s/g, "");
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) {
      setReferralCredit(0);
      setCreditChecked(false);
      return;
    }
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    phoneCheckTimer.current = setTimeout(() => {
      fetch(`/api/referral/check?phone=${encodeURIComponent(cleaned)}`)
        .then((r) => r.json())
        .then((data) => {
          setReferralCredit(data.credits ?? 0);
          setCreditChecked(true);
          setReferralUsesLeft(data.usesLeft ?? null);
          if (data.milestoneCode && !promoResult) {
            setPromoCode(data.milestoneCode);
            setMilestoneCode(data.milestoneCode);
          }
        })
        .catch(() => {});
    }, 600);
    return () => { if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current); };
  }, [phone]);

  function validatePhone(p: string) {
    return /^0[2-5][0-9]{8}$/.test(p.replace(/\s/g, ""));
  }

  async function handlePay() {
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!validatePhone(phone)) return setError("Enter a valid Ghana phone number (e.g. 0241234567).");
    if (!validatePhone(refundPhone)) return setError("Enter a valid MoMo number for refund purposes (e.g. 0241234567).");
    if (!paystackReady) return setError("Payment is still loading. Please try again in a moment.");

    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) {
      setError("Paystack key is missing. Add NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY to Vercel environment variables.");
      return;
    }

    setLoading(true);

    // Check if this phone number has previously been blocked by Inventor's beneficiary list
    try {
      const preCheck = await fetch(`/api/pre-check?phone=${encodeURIComponent(phone.replace(/\s/g, ""))}`);
      const preData = await preCheck.json();
      if (preData.blocked) {
        setLoading(false);
        setError(
          "⚠️ This number was previously blocked from receiving data. " +
          "Please contact us on WhatsApp before paying so we can resolve it first."
        );
        return;
      }
    } catch {
      // Network error on pre-check — let it through, backend will handle it
    }

    // For price-mode agent storefronts, check wallet balance before charging the customer
    if (agentCode) {
      try {
        const check = await fetch(
          `/api/agents/can-fulfill?agentCode=${encodeURIComponent(agentCode)}&bundleId=${encodeURIComponent(bundle.id)}`
        );
        const checkData = await check.json();
        if (!checkData.canFulfill) {
          setLoading(false);
          setError("This agent does not have enough wallet credit to fulfill this order right now. Please contact them to top up their account.");
          return;
        }
      } catch {
        // Network error on pre-check — let the backend guard catch it
      }
    }

    const autoEmail = `${phone.replace(/\s/g, "")}@elitedata1.com`;

    try {
      const handler = window.PaystackPop.setup({
        key,
        email: autoEmail,
        amount: Math.round(totalAmount * 100),
        currency: "GHS",
        ref: `elite-${Date.now()}`,
        metadata: {
          custom_fields: [
            { display_name: "Customer Name", variable_name: "name", value: name },
            { display_name: "Phone Number", variable_name: "phone", value: phone },
            { display_name: "Bundle", variable_name: "bundle", value: `${net.name} ${bundle.size}` },
            { display_name: "Bundle ID", variable_name: "bundle_id", value: bundle.id },
            { display_name: "Agent Code", variable_name: "agent_code", value: agentCode ?? "" },
          ],
        },
        callback: function(response: { reference: string }) {
          fetch("/api/orders/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              email: autoEmail,
              phone,
              bundleId: bundle.id,
              paystackRef: response.reference,
              agentCode: agentCode ?? null,
              referralVia: referralVia ?? null,
              applyReferralCredit: referralCredit > 0,
              fastDelivery: fastDelivery,
              promoCode: promoResult?.code ?? null,
              promoDiscount: promoDiscount > 0 ? promoDiscount : null,
              refundPhone: refundPhone.replace(/\s/g, ""),
              refundNetwork,
            }),
          })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              setLoading(false);
              if (data.success) {
                if (promoResult?.id) {
                  fetch("/api/use-coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promoResult.id }) }).catch(() => {});
                }
                setSuccess({ reference: data.reference, loyalty: data.loyalty });
              } else {
                setError(data.error || "Something went wrong. Please contact support.");
              }
            })
            .catch(function() {
              setLoading(false);
              setError("Network error. Please contact support on WhatsApp.");
            });
        },
        onClose: () => {
          setLoading(false);
        },
      });

      handler.openIframe();
    } catch (err) {
      setLoading(false);
      setError(`Paystack error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (success) {
    const loyalty = success.loyalty;
    const referralLink = typeof window !== "undefined"
      ? `${window.location.origin}/buy?via=${phone.replace(/\s/g, "")}`
      : "";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="p-6 text-center border-b border-gray-100">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-gray-800 mb-1">Payment Confirmed!</h2>
            <p className="text-gray-500 text-sm">
              Your <span className="font-bold">{net.name} {bundle.size}</span> bundle is being delivered to{" "}
              <span className="font-bold">{phone}</span>.
            </p>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* Order reference */}
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Order Reference</p>
              <p className="font-mono font-bold text-gray-800 text-sm break-all">{success.reference}</p>
            </div>

            {/* Loyalty progress */}
            {loyalty && (
              loyalty.rewardEarned ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl mb-1">🎉</p>
                  <p className="font-black text-emerald-700 text-sm">FREE 1GB EARNED!</p>
                  <p className="text-emerald-600 text-xs mt-0.5">
                    You bought 4 bundles today — a free 1GB {net.name} bundle is being delivered to your phone!
                  </p>
                </div>
              ) : loyalty.count > 0 && loyalty.windowEndsAt ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-amber-700">🔥 Loyalty Punch Card</p>
                    <p className="text-[10px] text-amber-500">{timeLeft(loyalty.windowEndsAt)} left</p>
                  </div>
                  <div className="flex gap-1.5 mb-1.5">
                    {Array.from({ length: loyalty.total }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-2 rounded-full ${i < loyalty.count ? "bg-amber-400" : "bg-amber-100"}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-amber-600">
                    {loyalty.count}/{loyalty.total} bundles ·{" "}
                    {loyalty.total - loyalty.count} more in {timeLeft(loyalty.windowEndsAt)} = <span className="font-bold">FREE 1GB!</span>
                  </p>
                </div>
              ) : null
            )}

            {/* Referral share */}
            {referralLink && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-blue-700 mb-1">💰 Refer &amp; Earn GH₵1</p>
                <p className="text-xs text-blue-600 mb-2">
                  Share your link — earn <span className="font-bold">GH₵1 off</span> your next purchase for every friend who buys!
                </p>
                <div className="flex gap-2">
                  <p className="flex-1 text-[10px] font-mono bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-blue-700 truncate">
                    {referralLink}
                  </p>
                  <button
                    onClick={() => copyToClipboard(referralLink, () => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
                    className="text-xs font-bold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <a
              href={`/track?ref=${encodeURIComponent(success.reference)}`}
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm text-center"
            >
              Track My Order Live →
            </a>
            <button onClick={onClose} className="w-full text-gray-400 hover:text-gray-600 text-sm py-1 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`${net.bgLight} rounded-t-2xl px-6 py-4 flex items-center justify-between border-b ${net.borderColor} border`}>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{net.name} Bundle</p>
            <h2 className="text-2xl font-black text-gray-800">{bundle.size}</h2>
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Bundle price</span>
                <span className="font-semibold text-gray-700">GH₵{bundle.price.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Processing fee (2%)</span>
                <span>GH₵{feeAmount.toFixed(2)}</span>
              </div>
              {referralCredit > 0 && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold">
                  <span>🎁 Referral credit</span>
                  <span>−GH₵{referralCredit.toFixed(2)}</span>
                </div>
              )}
              {promoResult && (
                <div className="flex items-center gap-2 text-xs text-purple-600 font-semibold">
                  <span>🏷️ {promoResult.code} ({promoResult.label})</span>
                  <span>−GH₵{promoResult.discount.toFixed(2)}</span>
                </div>
              )}
              {fastDelivery && (
                <div className="flex items-center gap-2 text-xs text-orange-500 font-semibold">
                  <span>⚡ Fast delivery</span>
                  <span>+GH₵{FAST_DELIVERY_FEE.toFixed(2)}</span>
                </div>
              )}
              <div className={`flex items-center gap-2 text-base font-black ${net.textColor}`}>
                <span>Total</span>
                <span>GH₵{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className={`w-14 h-14 rounded-full ${net.bgColor} flex items-center justify-center text-white font-black text-sm shrink-0`}>
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {net.name} Phone Number <span className="text-gray-400">(bundle will be sent here)</span>
            </label>
            <input type="tel" placeholder="0241234567" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
            {creditChecked && referralCredit > 0 && (
              <p className="text-xs text-emerald-600 font-semibold mt-1">🎁 GH₵{referralCredit.toFixed(2)} referral credit applied!</p>
            )}
            {creditChecked && milestoneCode && !promoResult && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs font-black text-amber-700">🏆 You earned a 20% milestone bonus!</p>
                <p className="text-xs text-amber-600 mt-0.5">10 people used your referral link. Tap Apply to get 20% off this order.</p>
                <button onClick={applyPromo} className="mt-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1 rounded-md">Apply 20% Off</button>
              </div>
            )}
            {creditChecked && referralUsesLeft !== null && referralUsesLeft > 0 && referralUsesLeft < 10 && (
              <p className="text-xs text-blue-500 mt-1">🔗 Your referral link: <span className="font-bold">{10 - referralUsesLeft}/10</span> uses · {referralUsesLeft} more to earn 20% off</p>
            )}
          </div>

          {/* Promo code */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Promo Code <span className="text-gray-400">(optional)</span></label>
            {promoResult ? (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5">
                <span className="text-sm font-black text-purple-700">🏷️ {promoResult.code}</span>
                <span className="text-xs text-purple-600">−GH₵{promoResult.discount.toFixed(2)}</span>
                <button onClick={() => { setPromoResult(null); setPromoCode(""); setPromoError(""); }} className="ml-auto text-xs text-gray-400 hover:text-red-500">✕ Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={promoCode} onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); }}
                  onKeyDown={e => e.key === "Enter" && applyPromo()}
                  placeholder="Enter code e.g. SAVE20"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 text-gray-900 bg-white uppercase tracking-wider" />
                <button onClick={applyPromo} disabled={promoApplying || !promoCode.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 bg-purple-600 hover:bg-purple-700 transition-colors shrink-0">
                  {promoApplying ? "…" : "Apply"}
                </button>
              </div>
            )}
            {promoError && <p className="text-xs text-red-500 mt-1 font-semibold">{promoError}</p>}
          </div>

          <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
            Bundle delivered instantly after payment · Validity: {bundle.validity}
          </div>

          {/* Fast delivery toggle */}
          <button
            type="button"
            onClick={() => setFastDelivery(v => !v)}
            className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all text-left ${fastDelivery ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-200"}`}
          >
            <span className="text-2xl">⚡</span>
            <div className="flex-1">
              <p className={`text-sm font-black ${fastDelivery ? "text-orange-600" : "text-gray-700"}`}>Fast Delivery</p>
              <p className="text-xs text-gray-400">Priority processing · +GH₵0.50</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${fastDelivery ? "border-orange-400 bg-orange-400" : "border-gray-300"}`}>
              {fastDelivery && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
          </button>

          {/* MoMo Refund Number — required */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">💳</span>
              <div>
                <p className="text-sm font-black text-amber-800">MoMo Refund Number <span className="text-red-500">*</span></p>
                <p className="text-xs text-amber-600">Required — used to refund you if delivery fails</p>
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={refundNetwork}
                onChange={e => setRefundNetwork(e.target.value)}
                className="border border-amber-300 rounded-lg px-2 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shrink-0"
              >
                <option value="mtn">MTN MoMo</option>
                <option value="telecel">Telecel Cash</option>
                <option value="airteltigo">AirtelTigo Money</option>
              </select>
              <input
                type="tel"
                placeholder="0241234567"
                value={refundPhone}
                onChange={e => setRefundPhone(e.target.value)}
                className="flex-1 border border-amber-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-gray-900 bg-white"
              />
            </div>
          </div>

          <button onClick={handlePay} disabled={loading || !paystackReady}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors text-sm">
            {loading ? "Processing..." : !paystackReady ? "Initializing payment…" : `Pay GH₵${totalAmount.toFixed(2)} via Paystack`}
          </button>

          <button onClick={onClose} className="w-full text-gray-500 hover:text-gray-700 text-sm py-1 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
