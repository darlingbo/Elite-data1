"use client";
import { useState, useEffect, useRef } from "react";
import { Bundle, networkConfig } from "@/lib/bundles";
import { normalizeGhPhone, detectGhProvider } from "@/lib/phone";

interface Props {
  bundle: Bundle;
  agentCode?: string;
  referralVia?: string;
  onClose: () => void;
  displayMode?: "modal" | "page";
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

type FailedState = {
  reference: string;
  network: string;
  bundleSize: string;
};

type PendingApprovalState = {
  reference: string;
};

type PaymentMethod = "mobile_money" | "card" | "bank";
type CheckoutStep = "details" | "confirm" | "method";

const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  description: string;
  icon: string;
  channels: string[];
}> = [
  {
    id: "mobile_money",
    label: "Mobile Money",
    description: "MTN MoMo, Telecel Cash or AT Money",
    icon: "📱",
    channels: ["mobile_money"],
  },
  {
    id: "card",
    label: "Debit or Credit Card",
    description: "Visa or Mastercard",
    icon: "💳",
    channels: ["card"],
  },
  {
    id: "bank",
    label: "Bank Payment",
    description: "Pay from a supported bank account",
    icon: "🏦",
    channels: ["bank", "bank_transfer"],
  },
];

// ── Beneficiary list (localStorage) ─────────────────────────────────────────
type Beneficiary = { label: string; phone: string };
const BEN_KEY = "elite_beneficiaries";

function useBeneficiaries() {
  const [list, setList] = useState<Beneficiary[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(BEN_KEY) : null;
      return raw ? (JSON.parse(raw) as Beneficiary[]) : [];
    } catch {
      return [];
    }
  });

  function save(phone: string, label: string) {
    const cleaned = phone.replace(/\s/g, "");
    setList(prev => {
      const next = [{ label: label.trim() || cleaned, phone: cleaned }, ...prev.filter(b => b.phone !== cleaned)].slice(0, 10);
      try { localStorage.setItem(BEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function remove(phone: string) {
    setList(prev => {
      const next = prev.filter(b => b.phone !== phone);
      try { localStorage.setItem(BEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  return { list, save, remove };
}

function usePaystackReady() {
  // Lazy init: if Paystack script was already loaded (e.g. cached), start as ready
  const [ready, setReady] = useState(() =>
    typeof window !== "undefined" && !!window.PaystackPop
  );

  useEffect(() => {
    if (ready) return; // Already ready — nothing to do

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
  }, [ready]);

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

export default function CheckoutModal({ bundle, agentCode, referralVia, onClose, displayMode = "modal" }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [fraudTrap, setFraudTrap] = useState(false);
  const [failedOrder, setFailedOrder] = useState<FailedState | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalState | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waNote, setWaNote] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waSubmitted, setWaSubmitted] = useState(false);
  const [referralCredit, setReferralCredit] = useState(0);
  const [creditChecked, setCreditChecked] = useState(false);
  const [milestoneCode, setMilestoneCode] = useState<string | null>(null);
  const [referralUsesLeft, setReferralUsesLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [fastDelivery, setFastDelivery] = useState(false);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoResult, setPromoResult] = useState<{ discount: number; code: string; id: string; label: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [surcharge, setSurcharge] = useState(0);
  const [agentSubaccountCode, setAgentSubaccountCode] = useState<string | null>(null);
  const [, setVerifying] = useState(false);
  const [manualDeliveryWarning, setManualDeliveryWarning] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const [beneficiarySaved, setBeneficiarySaved] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mobile_money");
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("details");
  const [momoPhone, setMomoPhone] = useState("");
  const [momoNetwork, setMomoNetwork] = useState<"mtn" | "telecel" | "at">("mtn");
  const [momoPending, setMomoPending] = useState(false);
  const [momoMessage, setMomoMessage] = useState("");
  const paystackReady = usePaystackReady();
  const { list: beneficiaries, save: saveBeneficiary, remove: removeBeneficiary } = useBeneficiaries();
  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const net = networkConfig[bundle.network];
  const feeAmount = parseFloat((bundle.price * PLATFORM_FEE_RATE).toFixed(2));
  const baseTotal = parseFloat((bundle.price + feeAmount).toFixed(2));
  const promoDiscount = promoResult?.discount ?? 0;
  const totalAmount = parseFloat(Math.max(baseTotal - referralCredit - promoDiscount + surcharge + (fastDelivery ? FAST_DELIVERY_FEE : 0), 0).toFixed(2));

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

  // Keep promoResult accessible inside the phone effect without adding it to deps
  const promoResultRef = useRef(promoResult);
  useEffect(() => { promoResultRef.current = promoResult; });

  // Check referral credits + surcharge when phone is entered
  useEffect(() => {
    const cleaned = phone.replace(/\s/g, "");
    const valid = /^0[2-5][0-9]{8}$/.test(cleaned);
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);

    // All setState calls go inside setTimeout so they're never synchronous in the effect body
    phoneCheckTimer.current = setTimeout(() => {
      if (!valid) {
        setReferralCredit(0);
        setCreditChecked(false);
        setSurcharge(0);
        return;
      }
      Promise.all([
        fetch(`/api/referral/check?phone=${encodeURIComponent(cleaned)}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/orders/pending-surcharge?phone=${encodeURIComponent(cleaned)}`).then(r => r.json()).catch(() => ({ surcharge: 0 })),
      ]).then(([data, sc]) => {
        setReferralCredit(data.credits ?? 0);
        setCreditChecked(true);
        setReferralUsesLeft(data.usesLeft ?? null);
        setSurcharge(sc.surcharge ?? 0);
        if (data.milestoneCode && !promoResultRef.current) {
          setPromoCode(data.milestoneCode);
          setMilestoneCode(data.milestoneCode);
        }
      });
    }, valid ? 600 : 0);

    return () => { if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current); };
  }, [phone]);

  function validatePhone(p: string) {
    return /^0[2-5][0-9]{8}$/.test(p.replace(/\s/g, ""));
  }

  function showConfirmation() {
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!validatePhone(phone)) return setError("Enter a valid Ghana phone number (e.g. 0241234567).");
    if (!momoPhone) {
      const norm = normalizeGhPhone(phone) ?? phone.replace(/\s/g, "");
      setMomoPhone(norm);
      const det = detectGhProvider(norm);
      if (det) setMomoNetwork(det);
    }
    setCheckoutStep("confirm");
  }

  async function completePaidOrder(reference: string) {
    const autoEmail = `${phone.replace(/\s/g, "")}@elitedata1.com`;
    const response = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: autoEmail,
        phone,
        bundleId: bundle.id,
        paystackRef: reference,
        agentCode: agentCode ?? null,
        referralVia: referralVia ?? null,
        applyReferralCredit: referralCredit > 0,
        fastDelivery,
        promoCode: promoResult?.code ?? null,
        promoDiscount: promoDiscount > 0 ? promoDiscount : null,
        surcharge: surcharge > 0 ? surcharge : null,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!data.success) {
      setError(data.error || "Something went wrong. Please contact support.");
      return;
    }
    if (data.fraudTrap) {
      setFraudTrap(true);
      return;
    }
    if (promoResult?.id) {
      fetch("/api/use-coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promoResult.id }) }).catch(() => {});
    }
    if (data.pendingApproval) {
      setPendingApproval({ reference: data.reference });
    } else if (data.failed) {
      setFailedOrder({ reference: data.reference, network: data.network, bundleSize: data.bundleSize });
    } else {
      setSuccess({ reference: data.reference, loyalty: data.loyalty });
    }
  }

  async function handlePay() {
    setError("");
    if (!name.trim()) return setError("Please enter your name.");
    if (!validatePhone(phone)) return setError("Enter a valid Ghana phone number (e.g. 0241234567).");

    if (paymentMethod !== "mobile_money") {
      if (!paystackReady) return setError("Payment is still loading. Please try again in a moment.");
      const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
      if (!key) {
        setError("Card/Bank payment is temporarily unavailable. Please pay with Mobile Money.");
        return;
      }
    }

    setLoading(true);

    // Check if this phone is blocked before doing anything else
    try {
      const br = await fetch("/api/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\s/g, "") }),
      });
      const bd = await br.json() as { blocked: boolean };
      if (bd.blocked) {
        setLoading(false);
        setError("👀 I SEE WHAT YOU ARE DOING");
        return;
      }
    } catch {
      // Network error — let backend guard catch it
    }

    // For MTN bundles: verify the number is on the Inventor beneficiary list before opening Paystack.
    // This catches ineligible numbers before the customer is charged.
    if (bundle.network === "mtn") {
      setVerifying(true);
      try {
        const vr = await fetch("/api/verify-mtn-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.replace(/\s/g, "") }),
        });
        const vd = await vr.json() as { verified: boolean; error?: string; pendingManual?: boolean; warning?: string };
        if (!vd.verified) {
          setLoading(false);
          setVerifying(false);
          setError(vd.error ?? "This MTN number is not eligible for data purchase. Please check the number and try again.");
          return;
        }
        if (vd.pendingManual && vd.warning) {
          setManualDeliveryWarning(vd.warning);
        }
      } catch {
        // Network error — let Inventor reject at purchase time if needed
      }
      setVerifying(false);
    }

    // For price-mode agent storefronts, check wallet balance before charging the customer
    if (agentCode) {
      try {
        const check = await fetch(
          `/api/agents/can-fulfill?agentCode=${encodeURIComponent(agentCode)}&bundleId=${encodeURIComponent(bundle.id)}`
        );
        const checkData = await check.json();
        if (checkData.subaccountCode) setAgentSubaccountCode(checkData.subaccountCode);
        if (!checkData.canFulfill) {
          setLoading(false);
          setError("This agent does not have enough wallet credit to fulfill this order right now. Please contact them to top up their account.");
          return;
        }
      } catch {
        // Network error on pre-check — let the backend guard catch it
      }
    }

    if (paymentMethod === "mobile_money") {
      const cleanMomoPhone = normalizeGhPhone(momoPhone || phone);
      if (!cleanMomoPhone) {
        setLoading(false);
        setError("Please enter a valid 10-digit Ghana Mobile Money phone number.");
        return;
      }

      setMomoPending(true);
      setMomoMessage("Initiating payment request to your phone…");

      try {
        const ybkRes = await fetch("/api/yebeck/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: totalAmount,
            phone: cleanMomoPhone,
            network: momoNetwork,
            type: "data_order",
            name,
            metadata: {
              customer_name: name,
              bundle_id: bundle.id,
              recipient_phone: phone,
              agent_code: agentCode ?? "",
            },
          }),
        });

        const ybkData = await ybkRes.json();
        if (!ybkRes.ok || !ybkData.ok) {
          setLoading(false);
          setMomoPending(false);
          setError(ybkData.message || "Could not start Mobile Money prompt. Please try again.");
          return;
        }

        const ybkRef = ybkData.reference;
        setMomoMessage(ybkData.message || "Prompt sent! Approve the transaction on your phone.");

        // Fast poll every 1.5 - 2s
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/yebeck/status?reference=${encodeURIComponent(ybkRef)}`);
            const statusData = await statusRes.json();
            if (statusData.status === "success") {
              clearInterval(pollInterval);
              setMomoPending(false);
              setMomoMessage("Payment approved! Creating order…");
              await completePaidOrder(ybkRef);
            } else if (statusData.status === "failed") {
              clearInterval(pollInterval);
              setLoading(false);
              setMomoPending(false);
              setError("Payment was declined or cancelled on your phone. Please try again.");
            } else {
              setMomoMessage("Waiting for approval on your phone… Check your handset prompt.");
            }
          } catch {
            // Keep polling
          }
        }, 1800);

        // Stop polling after 3 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          if (momoPending) {
            setLoading(false);
            setMomoPending(false);
            setError("Payment timed out. If you already approved it, please check your orders or contact support.");
          }
        }, 180000);

        return;
      } catch (err) {
        setLoading(false);
        setMomoPending(false);
        setError(`Mobile Money request failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    const autoEmail = `${phone.replace(/\s/g, "")}@elitedata1.com`;
    const selectedPaymentMethod = PAYMENT_METHODS.find(method => method.id === paymentMethod) ?? PAYMENT_METHODS[0];

    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!paystackKey) {
      setLoading(false);
      setError("Card/Bank payment is unavailable. Please choose Mobile Money.");
      return;
    }

    // Card and bank go through Paystack popup
    try {
      const handler = window.PaystackPop.setup({
        key: paystackKey,
        email: autoEmail,
        amount: Math.round(totalAmount * 100),
        currency: "GHS",
        channels: selectedPaymentMethod.channels,
        ref: `elite-${Date.now()}`,
        ...(agentSubaccountCode ? { subaccount: agentSubaccountCode, bearer: "account" } : {}),
        metadata: {
          custom_fields: [
            { display_name: "Customer Name", variable_name: "name", value: name },
            { display_name: "Phone Number", variable_name: "phone", value: phone },
            { display_name: "Bundle", variable_name: "bundle", value: `${net.name} ${bundle.size}` },
            { display_name: "Bundle ID", variable_name: "bundle_id", value: bundle.id },
            { display_name: "Agent Code", variable_name: "agent_code", value: agentCode ?? "" },
            { display_name: "Promo Code", variable_name: "promo_code", value: promoResult?.code ?? "" },
            { display_name: "Referral Credit", variable_name: "apply_referral_credit", value: referralCredit > 0 ? "1" : "0" },
            { display_name: "Fast Delivery", variable_name: "fast_delivery", value: fastDelivery ? "1" : "0" },
          ],
        },
        callback: function(response: { reference: string }) {
          completePaidOrder(response.reference).catch(() => {
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
      setError(`Secure payment error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (fraudTrap) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
        <div className="bg-black rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center border border-red-900">
          <div className="text-6xl mb-4">👀</div>
          <h2 className="text-2xl font-black text-red-500 mb-3">I SEE WHAT YOU ARE DOING</h2>
          <p className="text-gray-400 text-sm">Your account has been flagged.</p>
        </div>
      </div>
    );
  }

  if (failedOrder) {
    const shortRef = failedOrder.reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="p-6 text-center border-b border-gray-100">
            <div className="text-5xl mb-3">❌</div>
            <h2 className="text-xl font-black text-gray-900 mb-1">Order Failed</h2>
            <p className="text-sm text-gray-500">We could not deliver your {failedOrder.network.toUpperCase()} {failedOrder.bundleSize}. Please enter your Mobile Money details below and we will refund you.</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs text-red-700 font-semibold mb-1">Order Reference</p>
              <p className="font-mono font-bold text-red-900 text-sm">{shortRef}</p>
            </div>

            {!waSubmitted ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile Money Name</label>
                  <input
                    type="text"
                    placeholder="Name on your MoMo account"
                    value={waPhone}
                    onChange={e => setWaPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile Money Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 0241234567"
                    value={waNote}
                    onChange={e => setWaNote(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>

                <button
                  onClick={async () => {
                    if (!waPhone.trim() || !waNote.trim()) return;
                    setWaSending(true);
                    await fetch("/api/orders/manual-request", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        reference: failedOrder.reference,
                        customerPhone: phone,
                        customerName: name,
                        network: failedOrder.network,
                        bundleSize: failedOrder.bundleSize,
                        refundName: waPhone.trim(),
                        refundPhone: waNote.trim(),
                      }),
                    }).catch(() => {});
                    setWaSending(false);
                    setWaSubmitted(true);
                  }}
                  disabled={waSending || !waPhone.trim() || !waNote.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
                >
                  {waSending ? "Submitting…" : "Submit Refund Request"}
                </button>
              </>
            ) : (
              <div className="text-center py-4 space-y-2">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-bold text-gray-800">Refund request received!</p>
                <p className="text-sm text-gray-500">Your refund will be processed within the next <strong>12 hours</strong>.</p>
                <p className="text-sm text-gray-500">If you do not receive it, please contact our help line.</p>
              </div>
            )}

            <button onClick={onClose} className="w-full border border-gray-200 text-gray-500 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pendingApproval) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="p-6 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-gray-800 mb-2">Order Placed! ✅</h2>
            <p className="text-gray-500 text-sm mb-4">
              Payment confirmed. Your <span className="font-bold">{net.name} {bundle.size}</span> bundle is being processed and will be delivered to <span className="font-bold">{phone}</span> shortly.
            </p>
            {/* Payment Receipt */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-left space-y-2">
              <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payment Receipt</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">PAID</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Order Reference</span>
                <span className="font-mono font-bold text-gray-800 break-all">{pendingApproval.reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Recipient Phone</span>
                <span className="font-bold text-gray-800">{phone}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Bundle</span>
                <span className="font-bold text-gray-800">{net.name} {bundle.size}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Gateway</span>
                <span className="font-semibold text-gray-700">{paymentMethod === "mobile_money" ? "Mobile Money (Yebeck)" : "Paystack"}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5 font-bold">
                <span className="text-gray-700">Amount Paid</span>
                <span className="text-emerald-600 text-sm">GH₵{totalAmount.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 border border-gray-300 text-gray-700 font-bold py-2 rounded-xl text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🖨️</span> Print Receipt
              </button>
              <a
                href={`/track?ref=${encodeURIComponent(pendingApproval.reference)}`}
                className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-xl text-xs hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
              >
                Track Live →
              </a>
            </div>
            <p className="text-xs text-gray-400 mb-4">You will receive an SMS once your bundle is delivered.</p>
            <button onClick={onClose} className="w-full bg-green-500 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-green-600 transition-colors">
              OK, Got it
            </button>
          </div>
        </div>
      </div>
    );
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
            {/* Payment Receipt */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left space-y-2">
              <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payment Receipt</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">PAID</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Order Reference</span>
                <span className="font-mono font-bold text-gray-800 break-all">{success.reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Recipient Phone</span>
                <span className="font-bold text-gray-800">{phone}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Bundle</span>
                <span className="font-bold text-gray-800">{net.name} {bundle.size}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Gateway</span>
                <span className="font-semibold text-gray-700">{paymentMethod === "mobile_money" ? "Mobile Money (Yebeck)" : "Paystack"}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5 font-bold">
                <span className="text-gray-700">Amount Paid</span>
                <span className="text-emerald-600 text-sm">GH₵{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full border border-gray-300 text-gray-700 font-bold py-2 rounded-xl text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>🖨️</span> Print Receipt
              </button>
            </div>

            {/* Save beneficiary prompt */}
            {!beneficiarySaved && !beneficiaries.some(b => b.phone === phone.replace(/\s/g, "")) && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-blue-700 mb-2">💾 Save this number?</p>
                <p className="text-xs text-blue-500 mb-3">
                  Save <span className="font-semibold">{phone}</span> so you can pick it quickly next time.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Label e.g. Mine, Mum, Dad"
                    value={saveLabel}
                    onChange={e => setSaveLabel(e.target.value)}
                    maxLength={20}
                    className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-800 bg-white"
                  />
                  <button
                    onClick={() => {
                      saveBeneficiary(phone, saveLabel || phone.replace(/\s/g, ""));
                      setBeneficiarySaved(true);
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
            {beneficiarySaved && (
              <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 text-xs font-semibold text-green-700">
                ✓ Number saved — you can pick it next time at checkout
              </div>
            )}

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
    <div className={displayMode === "page" ? "w-full" : "fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"}>
      <div className={displayMode === "page" ? "bg-white w-full overflow-hidden" : "bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"}>
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
              {surcharge > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-600 font-semibold">
                  <span>⚠️ Outstanding balance</span>
                  <span>+GH₵{surcharge.toFixed(2)}</span>
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
        <div className="checkout-flow px-4 py-5 space-y-4 sm:px-6">
          <div className="flex items-center gap-2" aria-label={`Checkout step ${checkoutStep}`}>
            {["details", "confirm", "method"].map((step, index) => {
              const activeIndex = checkoutStep === "details" ? 0 : checkoutStep === "confirm" ? 1 : 2;
              return <span key={step} className={`h-1.5 flex-1 rounded-full ${index <= activeIndex ? "bg-amber-400" : "bg-gray-200"}`} />;
            })}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          {manualDeliveryWarning && (
            <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm px-3 py-2 rounded-lg">
              ⏳ {manualDeliveryWarning}
            </div>
          )}

          {checkoutStep === "details" && (<>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
            <input type="text" placeholder="e.g. Kwame Mensah" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600">
                {net.name} Phone Number <span className="text-gray-400">(bundle will be sent here)</span>
              </label>
              {beneficiaries.length > 0 && (
                <span className="text-[10px] text-gray-400">Saved numbers ↓</span>
              )}
            </div>

            {/* Beneficiary chips */}
            {beneficiaries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {beneficiaries.map(b => (
                  <div key={b.phone} className="group flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full pl-3 pr-1 py-1">
                    <button
                      type="button"
                      onClick={() => setPhone(b.phone)}
                      className="text-xs font-semibold text-blue-700 leading-none"
                    >
                      {b.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBeneficiary(b.phone)}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-blue-300 hover:text-red-400 hover:bg-red-50 transition-colors text-[10px] font-bold leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                  className="min-w-0 flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 text-gray-900 bg-white uppercase tracking-wider" />
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

          <button onClick={showConfirmation} className="w-full rounded-xl bg-amber-400 py-3 font-black text-slate-950 hover:bg-amber-300">
            Proceed to Payment
          </button>
          </>)}

          {checkoutStep === "confirm" && (
            <section className="space-y-4" aria-labelledby="confirm-order-title">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-amber-500">Step 1</p>
                <h3 id="confirm-order-title" className="mt-1 text-2xl font-black text-slate-900">Confirm Your Order</h3>
                <p className="mt-1 text-sm text-slate-500">Please confirm your details before proceeding.</p>
              </div>
              <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                {[
                  ["Customer Name", name],
                  ["Customer Phone Number", phone],
                  ["Data Recipient Number", phone],
                  ["Network", net.name],
                  ["Bundle", bundle.size],
                  ["Amount", `GHS ${totalAmount.toFixed(2)}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 py-3">
                    <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                    <dd className="max-w-[58%] text-right text-sm font-black text-slate-900 wrap-break-word">{value}</dd>
                  </div>
                ))}
              </dl>
              <button onClick={() => setCheckoutStep("method")} className="w-full rounded-xl bg-amber-400 py-3 font-black text-slate-950 hover:bg-amber-300">Proceed to Payment</button>
              <button onClick={() => setCheckoutStep("details")} className="w-full py-2 text-sm font-bold text-slate-500">← Edit details</button>
            </section>
          )}

          {/* Payment method */}
          {checkoutStep === "method" && (<fieldset>
            <div className="mb-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-800 uppercase tracking-wider mb-2">
                ⚡ Instant MoMo Prompt
              </span>
              <p className="text-xs text-slate-500">Total to Pay</p>
              <p className="text-3xl font-black text-slate-900">GHS {totalAmount.toFixed(2)}</p>
            </div>

            <legend className="mb-2 block text-xs font-semibold text-gray-700">Payment method</legend>
            <div className="space-y-2.5" role="radiogroup" aria-label="Payment method">
              {PAYMENT_METHODS.map(method => {
                const selected = paymentMethod === method.id;
                const isMoMo = method.id === "mobile_money";
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`relative flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all ${
                      selected
                        ? isMoMo
                          ? "border-amber-400 bg-amber-50/50 shadow-sm"
                          : "border-blue-600 bg-blue-50/50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl shadow-xs ${
                      selected
                        ? isMoMo
                          ? "bg-amber-400 text-slate-950 font-bold"
                          : "bg-blue-600 text-white font-bold"
                        : "bg-gray-100"
                    }`}>
                      {method.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${selected ? "text-slate-900" : "text-gray-800"}`}>
                          {method.label}
                        </span>
                        {isMoMo && (
                          <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-black text-amber-900">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <span className="block text-xs leading-5 text-gray-500 mt-0.5">{method.description}</span>
                    </span>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                      selected ? (isMoMo ? "border-amber-500 bg-amber-400" : "border-blue-600 bg-blue-600") : "border-gray-300"
                    }`}>
                      {selected && <span className={`h-2 w-2 rounded-full ${isMoMo ? "bg-slate-950" : "bg-white"}`} />}
                    </span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === "mobile_money" && (
              <div className="mt-4 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/60 to-orange-50/30 p-4 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <span>📱</span> MoMo Wallet Details
                  </p>
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                    Yebeck Gateway
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone number to charge from
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={momoPhone}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMomoPhone(val);
                      const det = detectGhProvider(val);
                      if (det) setMomoNetwork(det);
                    }}
                    placeholder="e.g. 0244000000"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:border-amber-500 focus:ring-2 focus:ring-amber-200 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    A prompt requesting approval will appear immediately on this phone
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Network Provider
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "mtn", label: "MTN MoMo", badge: "MTN", color: "border-yellow-400 bg-yellow-50 text-yellow-900" },
                      { id: "telecel", label: "Telecel Cash", badge: "Telecel", color: "border-red-400 bg-red-50 text-red-900" },
                      { id: "at", label: "AT Money", badge: "AT", color: "border-blue-400 bg-blue-50 text-blue-900" },
                    ].map(netOption => {
                      const isNetActive = momoNetwork === netOption.id;
                      return (
                        <button
                          key={netOption.id}
                          type="button"
                          onClick={() => setMomoNetwork(netOption.id as "mtn" | "telecel" | "at")}
                          className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border-2 text-center transition-all ${
                            isNetActive
                              ? `${netOption.color} font-black shadow-xs`
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          <span className="text-xs font-bold">{netOption.badge}</span>
                          <span className="text-[10px] text-gray-500 mt-0.5">{netOption.label.split(" ")[1]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {momoPending && (
              <div className="mt-3.5 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-900 flex items-start gap-3 animate-pulse shadow-sm">
                <span className="text-2xl mt-0.5">📲</span>
                <div className="flex-1 space-y-1">
                  <p className="font-black text-sm text-amber-950">Prompt Sent to Your Phone!</p>
                  <p className="text-amber-800 leading-relaxed">
                    {momoMessage || "Please check your phone screen and enter your Mobile Money PIN to approve the transaction."}
                  </p>
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-700 font-bold">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                    Checking payment every 1.8s · Will confirm automatically
                  </div>
                </div>
              </div>
            )}

            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-gray-500">
              <span aria-hidden="true">🔒</span> Encrypted transaction via Yebeck. Fast automated verification upon phone approval.
            </p>

            <button
              onClick={() => void handlePay()}
              disabled={loading || (paymentMethod !== "mobile_money" && !paystackReady)}
              className="mt-4 w-full rounded-2xl bg-amber-400 py-3.5 font-black text-slate-950 shadow-md hover:bg-amber-300 transition-all disabled:opacity-60 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                momoPending ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Waiting for handset approval…</span>
                  </>
                ) : (
                  <span>Opening secure payment…</span>
                )
              ) : paymentMethod === "mobile_money" ? (
                <>
                  <span>Pay GH₵{totalAmount.toFixed(2)} with MoMo</span>
                  <span className="text-base">⚡</span>
                </>
              ) : !paystackReady ? (
                <span>Loading secure payment…</span>
              ) : (
                <span>Pay GH₵{totalAmount.toFixed(2)}</span>
              )}
            </button>
            <button onClick={() => setCheckoutStep("confirm")} className="mt-2.5 w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-800">
              ← Edit details
            </button>
          </fieldset>)}

          <button onClick={onClose} className="w-full text-gray-500 hover:text-gray-700 text-sm py-1 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
