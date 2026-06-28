"use client";
import { useState, useEffect } from "react";

declare global { interface Window { PaystackPop: { setup: (opts: object) => { openIframe: () => void } } } }

const VOUCHERS = [
  { id: "BECE",   label: "BECE",   full: "Basic Education Certificate Examination",           price: 18, color: "#3b82f6", dark: "#1d4ed8", emoji: "📗" },
  { id: "WASSCE", label: "WASSCE", full: "West African Senior School Certificate Examination", price: 18, color: "#8b5cf6", dark: "#6d28d9", emoji: "📘" },
] as const;

type VoucherID = typeof VOUCHERS[number]["id"];

const D = { bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e" };

function usePaystackReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.PaystackPop) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, []);
  return ready;
}

export default function VouchersPage() {
  const [selectedId, setSelectedId] = useState<VoucherID>("BECE");
  const [quantity, setQuantity]     = useState(1);
  const [phone, setPhone]           = useState("");
  const [step, setStep]             = useState<"pick" | "pay">("pick");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState<{ reference: string } | null>(null);
  const paystackReady               = usePaystackReady();

  const selected = VOUCHERS.find(v => v.id === selectedId)!;
  const subtotal = selected.price * quantity;
  const fee      = parseFloat((subtotal * 0.02).toFixed(2));
  const total    = parseFloat((subtotal + fee).toFixed(2));

  function handlePay() {
    setError("");
    const cleaned = phone.replace(/\s/g, "");
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setError("Enter a valid Ghana phone number (e.g. 0241234567)."); return; }
    if (!paystackReady) { setError("Payment loading, try again."); return; }

    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) { setError("Paystack key missing."); return; }

    const email = `${cleaned}@voucher.elitedata.com`;
    setLoading(true);

    try {
      const handler = window.PaystackPop.setup({
        key, email,
        amount: Math.round(total * 100),
        currency: "GHS",
        ref: `elite-vch-${Date.now()}`,
        metadata: {
          custom_fields: [
            { display_name: "Phone",   variable_name: "phone",   value: cleaned },
            { display_name: "Voucher", variable_name: "voucher", value: `${selected.label} x${quantity}` },
          ],
        },
        callback: (res: { reference: string }) => {
          fetch("/api/vouchers/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Customer", email, phone: cleaned, voucherType: selected.id, quantity, paystackRef: res.reference }),
          })
            .then(r => r.json())
            .then(data => {
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
      setError(`Payment error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* ── Success screen ── */
  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 24, padding: "40px 28px", maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>✅</div>
          <h2 style={{ color: D.text, fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>Voucher Purchased!</h2>
          <p style={{ color: D.muted, fontSize: 13, margin: "0 0 20px", lineHeight: 1.6 }}>
            Your <strong style={{ color: D.text }}>{selected.label} × {quantity}</strong> voucher code{quantity > 1 ? "s have" : " has"} been sent via SMS to <strong style={{ color: D.text }}>{phone}</strong>.
          </p>
          <div style={{ background: "#0a0f1a", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 4px" }}>Order Reference</p>
            <p style={{ color: "#60a5fa", fontFamily: "monospace", fontWeight: 700, fontSize: 13, margin: 0, wordBreak: "break-all" }}>{success.reference}</p>
          </div>
          <a href={`/track?ref=${encodeURIComponent(success.reference)}`}
            style={{ display: "block", background: "#3b82f6", color: "white", textDecoration: "none", borderRadius: 14, padding: "14px 0", fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
            Track Order →
          </a>
          <a href="/vouchers" style={{ color: D.muted, fontSize: 13, textDecoration: "underline" }}>Buy another voucher</a>
        </div>
      </div>
    );
  }

  /* ── Main page ── */
  return (
    <div style={{ minHeight: "100vh", background: D.bg, color: D.text, fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📋</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Result Checker Vouchers</h1>
              <p style={{ color: D.muted, fontSize: 12, margin: 0 }}>BECE & WASSCE · Instant SMS delivery</p>
            </div>
          </div>
        </div>

        {/* Notice */}
        <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
          <p style={{ color: "#93c5fd", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            Voucher codes are delivered instantly via SMS after payment. Each code can be used once on the official checking portal.
          </p>
        </div>

        {/* Step 1 — Pick voucher */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>1 · Choose Exam Type</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {VOUCHERS.map(v => (
              <button key={v.id} onClick={() => setSelectedId(v.id)} style={{
                borderRadius: 16, padding: 16, border: `2px solid ${selectedId === v.id ? v.color : D.border}`,
                background: selectedId === v.id ? `${v.color}15` : "transparent",
                cursor: "pointer", textAlign: "left", transition: "all .15s",
              }}>
                <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>{v.emoji}</span>
                <p style={{ fontSize: 15, fontWeight: 900, color: D.text, margin: "0 0 4px" }}>{v.label}</p>
                <p style={{ fontSize: 10, color: D.muted, margin: "0 0 10px", lineHeight: 1.4 }}>{v.full}</p>
                <p style={{ fontSize: 18, fontWeight: 900, color: v.color, margin: 0 }}>GH₵{v.price.toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2 — Quantity */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>2 · Quantity (1–10)</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${D.border}`, background: "transparent", color: D.text, fontSize: 22, fontWeight: 700, cursor: "pointer" }}>−</button>
            <span style={{ fontSize: 28, fontWeight: 900, color: D.text, minWidth: 36, textAlign: "center" }}>{quantity}</span>
            <button onClick={() => setQuantity(q => Math.min(10, q + 1))} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${D.border}`, background: "transparent", color: D.text, fontSize: 22, fontWeight: 700, cursor: "pointer" }}>+</button>
            <div style={{ flex: 1, background: "#0a0f1a", borderRadius: 12, padding: "10px 14px", textAlign: "right" }}>
              <p style={{ color: D.muted, fontSize: 11, margin: "0 0 2px" }}>Subtotal</p>
              <p style={{ color: D.text, fontWeight: 900, fontSize: 18, margin: 0 }}>GH₵{subtotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Step 3 — Phone */}
        <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>3 · Your Phone Number</p>
          <p style={{ color: D.muted, fontSize: 12, margin: "0 0 10px" }}>Voucher codes will be sent here via SMS</p>
          <input
            type="tel" placeholder="0241234567" value={phone} onChange={e => setPhone(e.target.value)}
            style={{ width: "100%", background: "#0a0f1a", border: `1px solid ${D.border}`, borderRadius: 12, padding: "14px 16px", color: D.text, fontSize: 16, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Order summary */}
        <div style={{ background: `${selected.color}0d`, border: `1px solid ${selected.color}30`, borderRadius: 16, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 2px" }}>Order Summary</p>
            <p style={{ color: D.text, fontWeight: 800, fontSize: 14, margin: 0 }}>{selected.label} × {quantity}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 2px" }}>Total (incl. 2% fee)</p>
            <p style={{ color: selected.color, fontWeight: 900, fontSize: 20, margin: 0 }}>GH₵{total.toFixed(2)}</p>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 14, color: "#f87171", fontSize: 13 }}>{error}</div>
        )}

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={loading || !paystackReady || !phone}
          style={{ width: "100%", background: `linear-gradient(135deg,${selected.color},${selected.dark})`, color: "white", border: "none", borderRadius: 16, padding: "16px 0", fontSize: 17, fontWeight: 900, cursor: loading || !paystackReady || !phone ? "not-allowed" : "pointer", opacity: loading || !paystackReady || !phone ? 0.6 : 1, boxShadow: `0 6px 24px ${selected.color}40`, transition: "all .15s" }}
        >
          {loading ? "Processing…" : !paystackReady ? "Loading payment…" : `Pay GH₵${total.toFixed(2)} ⚡`}
        </button>

        <p style={{ color: D.muted, fontSize: 11, textAlign: "center", margin: "12px 0 0" }}>🔒 Secured by Paystack</p>
      </div>
    </div>
  );
}
