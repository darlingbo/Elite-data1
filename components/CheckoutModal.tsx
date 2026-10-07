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
  const [name, setName] = useState("Customer");
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
    const customerName = name.trim() || "Customer";
    const response = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: customerName,
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
    if (!validatePhone(phone)) return setError("Enter a valid Ghana phone number (e.g. 0241234567).");
    const customerName = name.trim() || "Customer";

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
            name: customerName,
            metadata: {
              customer_name: customerName,
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
            { display_name: "Customer Name", variable_name: "name", value: customerName },
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
    <div className={displayMode === "page" ? "w-full" : "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"}>
      <div className={displayMode === "page" ? "bg-white w-full overflow-hidden p-6" : "bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4"} onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-xl font-black text-slate-900">Confirm purchase</h2>
          <p className="mt-1 text-sm text-slate-600">
            You are purchasing <span className="font-bold">{bundle.size}</span> for{" "}
            <span className="font-bold">GH₵{bundle.price.toFixed(2)}</span>
          </p>
        </div>

        <div>
          <label htmlFor="recipient_phone" className="block text-sm font-semibold text-slate-700">
            Recipient {bundle.network === "airteltigo" ? "AT" : bundle.network.toUpperCase()} number
          </label>
          <input
            id="recipient_phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              const v = e.target.value;
              setPhone(v);
              if (!momoPhone || momoPhone === phone) {
                setMomoPhone(v);
                const det = detectGhProvider(v);
                if (det) setMomoNetwork(det);
              }
            }}
            placeholder="0599322785 or +233599322785"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div>
          <label htmlFor="momo_phone" className="block text-sm font-semibold text-slate-700">
            Mobile Money number to pay from
          </label>
          <input
            id="momo_phone"
            type="tel"
            inputMode="tel"
            value={momoPhone}
            onChange={(e) => {
              const v = e.target.value;
              setMomoPhone(v);
              const det = detectGhProvider(v);
              if (det) setMomoNetwork(det);
            }}
            placeholder="0244000000"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div>
          <label htmlFor="momo_network" className="block text-sm font-semibold text-slate-700">
            Mobile Money network
          </label>
          <select
            id="momo_network"
            value={momoNetwork}
            onChange={(e) => setMomoNetwork(e.target.value as "mtn" | "telecel" | "at")}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-400"
          >
            <option value="mtn">MTN</option>
            <option value="telecel">Telecel</option>
            <option value="at">AT</option>
          </select>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Yebeck may add a transaction fee. Check the total shown on your phone before approving.
        </p>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-600">
            {error}
          </p>
        )}

        {momoPending && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800 animate-pulse">
            {momoMessage || "Waiting for approval on your phone…"}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={loading || !phone.trim() || !momoPhone.trim()}
            className="flex-1 rounded-xl bg-[#f87171] hover:bg-rose-500 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
          >
            {loading ? (momoPending ? "Waiting…" : "Processing…") : "Confirm"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 pt-1">
          A payment prompt will be sent to the number entered above.
        </p>
      </div>
    </div>
  );
}
