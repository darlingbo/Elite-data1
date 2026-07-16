"use client";
import { useState, useEffect } from "react";

const VOUCHER_META = [
  { id: "BECE"   as const, label: "BECE",   full: "Basic Education Certificate Examination",           color: "#3b82f6", dark: "#1d4ed8", glow: "rgba(59,130,246,0.4)",  emoji: "📗" },
  { id: "WASSCE" as const, label: "WASSCE", full: "West African Senior School Certificate Examination", color: "#8b5cf6", dark: "#6d28d9", glow: "rgba(139,92,246,0.4)", emoji: "📘" },
];

type VoucherID = "BECE" | "WASSCE";
type VoucherEntry = typeof VOUCHER_META[number] & {
  price: number;
  bulkPrice: number;
  bulkThreshold: number;
};

const D = { bg: "#080d18", card: "#0d1525", border: "#1a2a45", text: "#e2e8f0", muted: "#64748b" };

function usePaystackReady() {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.PaystackPop);
  useEffect(() => {
    if (ready) return;
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
  }, [ready]);
  return ready;
}

function normalizeGhana(raw: string): string {
  let v = raw.replace(/[\s\-\(\)]/g, "");
  if (v.startsWith("+233")) v = v.slice(4);
  else if (v.startsWith("233")) v = v.slice(3);
  if (!v.startsWith("0")) v = "0" + v;
  return v;
}

const HOW_TO_BUY = [
  "Tap a card below to flip it — you'll see the price. Press \"Select\" to choose that exam type.",
  "Pick how many vouchers you need. Buying 11 or more unlocks the bulk price of GH₵18 each.",
  "Enter the Ghana phone number where your voucher codes will be sent via SMS.",
  "Pay securely with Paystack (card or Mobile Money). You'll get your codes within minutes.",
];

export default function VouchersPage() {
  const [selectedId, setSelectedId]   = useState<VoucherID>("BECE");
  const [quantity, setQuantity]       = useState(1);
  const [phone, setPhone]             = useState("");
  const [promoCode, setPromoCode]     = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [showPromo, setShowPromo]     = useState(false);
  const [phoneError, setPhoneError]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState<{ reference: string } | null>(null);
  const [mounted, setMounted]         = useState(false);
  const [phoneFocus, setPhoneFocus]   = useState(false);
  const [flipped, setFlipped]         = useState<VoucherID | null>(null);
  const [vouchers, setVouchers]       = useState<VoucherEntry[]>(
    VOUCHER_META.map(m => ({ ...m, price: 19, bulkPrice: 18, bulkThreshold: 10 }))
  );
  const paystackReady = usePaystackReady();

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    fetch("/api/vouchers/prices")
      .then(r => r.json())
      .then((data: Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number }>) => {
        setVouchers(VOUCHER_META.map(m => ({
          ...m,
          price:          data[m.id]?.sellPrice      ?? 19,
          bulkPrice:      data[m.id]?.bulkPrice      ?? 18,
          bulkThreshold:  data[m.id]?.bulkThreshold  ?? 10,
        })));
      })
      .catch(() => {});
  }, []);

  const selected      = vouchers.find(v => v.id === selectedId)!;
  const isBulk        = quantity > selected.bulkThreshold;
  const hasDiscount   = isBulk || promoApplied;
  const effectivePrice = hasDiscount ? selected.bulkPrice : selected.price;
  const subtotal      = parseFloat((effectivePrice * quantity).toFixed(2));
  const fee           = parseFloat((subtotal * 0.02).toFixed(2));
  const total         = parseFloat((subtotal + fee).toFixed(2));
  const normalizedPhone = normalizeGhana(phone);
  const phoneValid      = /^0[2-5][0-9]{8}$/.test(normalizedPhone);
  const canPay          = phoneValid && !phoneError && paystackReady && !loading;
  const bulkLeft      = selected.bulkThreshold + 1 - quantity;

  function changeQty(val: number) {
    setQuantity(Math.min(50, Math.max(1, val)));
  }

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) { setPromoMsg({ ok: false, text: "Enter a discount code first." }); return; }
    setPromoChecking(true);
    setPromoMsg(null);
    try {
      const data = await fetch(`/api/vouchers/prices?code=${encodeURIComponent(code)}`).then(r => r.json()) as
        Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number; promoApplied: boolean }>;
      const applied = Object.values(data).some(v => v.promoApplied);
      if (applied) {
        setPromoApplied(true);
        setVouchers(VOUCHER_META.map(m => ({ ...m, price: data[m.id]?.sellPrice ?? 19, bulkPrice: data[m.id]?.bulkPrice ?? 18, bulkThreshold: data[m.id]?.bulkThreshold ?? 10 })));
        setPromoMsg({ ok: true, text: "Discount code applied! GH₵18 each." });
      } else {
        setPromoApplied(false);
        setPromoMsg({ ok: false, text: "Invalid or expired discount code." });
      }
    } catch { setPromoMsg({ ok: false, text: "Could not validate. Try again." }); }
    setPromoChecking(false);
  }

  function clearPromo() {
    setPromoCode(""); setPromoApplied(false); setPromoMsg(null);
    fetch("/api/vouchers/prices")
      .then(r => r.json())
      .then((data: Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number }>) => {
        setVouchers(VOUCHER_META.map(m => ({ ...m, price: data[m.id]?.sellPrice ?? 19, bulkPrice: data[m.id]?.bulkPrice ?? 18, bulkThreshold: data[m.id]?.bulkThreshold ?? 10 })));
      })
      .catch(() => {});
  }

  function handlePay() {
    setError("");
    const cleaned = normalizeGhana(phone);
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setError("Enter a valid Ghana phone number (e.g. 0241234567 or +233241234567)."); return; }
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
            { display_name: "Promo",   variable_name: "promo",   value: promoApplied ? "yes" : "no" },
          ],
        },
        callback: (res: { reference: string }) => {
          fetch("/api/vouchers/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Customer", email, phone: cleaned,
              voucherType: selected.id, quantity,
              paystackRef: res.reference,
              promoCode: promoApplied ? promoCode.trim() : undefined,
            }),
          })
            .then(r => r.json())
            .then(data => { setLoading(false); if (data.success) setSuccess({ reference: data.reference }); else setError(data.error || "Something went wrong."); })
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

  /* ── Success ── */
  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{`
          @keyframes successPop  { 0%{transform:scale(0) rotate(-15deg);opacity:0} 60%{transform:scale(1.15) rotate(5deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
          @keyframes confettiDrop { 0%{transform:translateY(-20px) rotate(0);opacity:1} 100%{transform:translateY(60px) rotate(360deg);opacity:0} }
          @keyframes fadeSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
          @keyframes ringPulse   { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)} 50%{box-shadow:0 0 0 16px rgba(34,197,94,0)} }
        `}</style>
        <div style={{ background: D.card, border: "1px solid rgba(34,197,94,0.3)", borderRadius: 28, padding: "44px 28px", maxWidth: 400, width: "100%", textAlign: "center", animation: "fadeSlideUp .5s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ position: "relative", display: "inline-block", marginBottom: 24 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "3px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, animation: "successPop .6s cubic-bezier(.22,1,.36,1) forwards, ringPulse 2s ease 0.6s infinite" }}>✅</div>
            {["🎉","⭐","✨","🎊","💫"].map((e, i) => (
              <span key={i} style={{ position: "absolute", top: -8, left: `${10 + i * 18}%`, fontSize: 14, animation: `confettiDrop .8s ease ${i * 0.1}s forwards` }}>{e}</span>
            ))}
          </div>
          <h2 style={{ color: "#4ade80", fontWeight: 900, fontSize: 24, margin: "0 0 8px", animation: "fadeSlideUp .5s .2s both" }}>Voucher Purchased!</h2>
          <p style={{ color: D.muted, fontSize: 13, margin: "0 0 20px", lineHeight: 1.7, animation: "fadeSlideUp .5s .3s both" }}>
            Your <strong style={{ color: D.text }}>{selected.label} × {quantity}</strong> voucher code{quantity > 1 ? "s have" : " has"} been sent via SMS to{" "}
            <strong style={{ color: "#60a5fa" }}>{phone}</strong>.
          </p>
          <div style={{ background: "#050b15", borderRadius: 14, padding: "14px 16px", marginBottom: 20, animation: "fadeSlideUp .5s .4s both" }}>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 4px" }}>Order Reference</p>
            <p style={{ color: "#60a5fa", fontFamily: "monospace", fontWeight: 700, fontSize: 13, margin: 0, wordBreak: "break-all" }}>{success.reference}</p>
          </div>
          <a href={`/track?ref=${encodeURIComponent(success.reference)}`}
            style={{ display: "block", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", textDecoration: "none", borderRadius: 16, padding: "15px 0", fontWeight: 900, fontSize: 15, marginBottom: 12, animation: "fadeSlideUp .5s .5s both", boxShadow: "0 6px 24px rgba(34,197,94,0.4)" }}>
            Track Order →
          </a>
          <a href="/vouchers" style={{ color: D.muted, fontSize: 13, textDecoration: "underline" }}>Buy another voucher</a>
        </div>
      </div>
    );
  }

  /* ── Main page ── */
  return (
    <div style={{ minHeight: "100vh", background: D.bg, color: D.text, fontFamily: "system-ui,sans-serif", position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes floatIcon   { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-8px) rotate(2deg)} }
        @keyframes slideUp     { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse   { 0%,100%{box-shadow:0 0 20px var(--glow-color,rgba(59,130,246,0.3))} 50%{box-shadow:0 0 40px var(--glow-color,rgba(59,130,246,0.6)), 0 0 80px var(--glow-color,rgba(59,130,246,0.2))} }
        @keyframes orb1        { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.2)} 66%{transform:translate(-40px,30px) scale(0.9)} }
        @keyframes orb2        { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-50px,50px) scale(0.8)} 66%{transform:translate(70px,-20px) scale(1.1)} }
        @keyframes cardCheck   { from{transform:scale(0) rotate(-10deg);opacity:0} to{transform:scale(1) rotate(0);opacity:1} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes rotation481 { 0%{transform:rotateZ(0deg)} 100%{transform:rotateZ(360deg)} }
        @keyframes floating    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(10px)} }
        .pay-btn:not(:disabled):hover { transform:translateY(-2px) !important; }
        .pay-btn:not(:disabled):active { transform:translateY(0px) scale(.98) !important; }
        .qty-btn:hover { background: rgba(255,255,255,0.1) !important; }
        .flip-card { perspective:1000px; cursor:pointer; }
        .flip-inner { width:100%; height:100%; transform-style:preserve-3d; transition:transform 420ms cubic-bezier(.22,1,.36,1); }
        .flip-card.is-flipped .flip-inner { transform:rotateY(180deg); }
        .flip-face { position:absolute; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius:18px; overflow:hidden; }
        .flip-front { transform:rotateY(180deg); }
        .flip-back { display:flex; align-items:center; justify-content:center; }
        .flip-back::before { content:''; position:absolute; width:140px; height:160%; animation:rotation481 4s linear infinite; border-radius:50%; }
        .flip-back-inner { position:absolute; width:99%; height:99%; border-radius:17px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; }
      `}</style>

      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "5%", left: "10%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 70%)", animation: "orb1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,0.1) 0%,transparent 70%)", animation: "orb2 15s ease-in-out infinite" }} />
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "32px 16px 100px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)", transition: "all .6s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 22, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", fontSize: 34, marginBottom: 16, animation: "floatIcon 3s ease-in-out infinite", boxShadow: "0 8px 32px rgba(139,92,246,0.4)" }}>📋</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 6px", background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Result Checker Vouchers
          </h1>
          <p style={{ color: D.muted, fontSize: 13, margin: 0 }}>BECE & WASSCE · Instant SMS delivery · GH₵19 each · Buy 11+ for GH₵18</p>
        </div>

        {/* How to Buy */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .05s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 22, padding: 20 }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: D.text, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>💡</span> How to Buy
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {HOW_TO_BUY.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#60a5fa", marginTop: 1 }}>{i + 1}</div>
                  <p style={{ color: D.muted, fontSize: 13, margin: 0, lineHeight: 1.55 }}>{step}</p>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "10px 14px", marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎁</span>
              <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, margin: 0 }}>
                Bulk deal: Buy <strong>11 or more</strong> and each voucher drops from GH₵19 → <strong>GH₵18</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Step 1 — Exam type */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .1s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 22, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "white" }}>1</div>
              <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Choose Exam Type</p>
            </div>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 14px" }}>Tap a card to flip it and see the price, then press Select</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {vouchers.map(v => {
                const isFlipped = flipped === v.id;
                const active    = selectedId === v.id;
                return (
                  <div key={v.id} className={`flip-card${isFlipped ? " is-flipped" : ""}`}
                    style={{ height: 200, position: "relative" }}
                    onClick={() => setFlipped(isFlipped ? null : v.id)}>
                    <div className="flip-inner" style={{ position: "relative", height: "100%", boxShadow: active ? `0 0 0 2px ${v.color}, 0 8px 32px ${v.glow}` : "0 4px 16px rgba(0,0,0,0.4)", borderRadius: 18 }}>
                      <div className="flip-face flip-back" style={{ background: D.card }}>
                        <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 18 }}>
                          <div className="circle" style={{ width: 80, height: 80, borderRadius: "50%", background: v.color, position: "absolute", left: 20, top: 30, filter: "blur(18px)", animation: "floating 2.6s infinite linear", opacity: 0.5 }} />
                          <div id="bottom" style={{ width: 120, height: 120, borderRadius: "50%", background: v.dark, position: "absolute", left: 50, top: -10, filter: "blur(20px)", animation: "floating 2.6s -800ms infinite linear", opacity: 0.35 }} />
                          <div id="right" style={{ width: 28, height: 28, borderRadius: "50%", background: v.color, position: "absolute", right: 20, top: 10, filter: "blur(8px)", animation: "floating 2.6s -1800ms infinite linear", opacity: 0.6 }} />
                        </div>
                        <style>{`.flip-back:nth-child(1)::before { background: linear-gradient(90deg,transparent,${v.color},${v.color},transparent); }`}</style>
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: "160px", height: "160%", position: "absolute", background: `linear-gradient(90deg,transparent,${v.color},${v.color},${v.color},transparent)`, animation: "rotation481 4s linear infinite", opacity: 0.7 }} />
                        </div>
                        <div className="flip-back-inner" style={{ background: D.card }}>
                          <span style={{ fontSize: 38 }}>{v.emoji}</span>
                          <p style={{ color: v.color, fontWeight: 900, fontSize: 18, margin: 0 }}>{v.label}</p>
                          <p style={{ color: D.muted, fontSize: 10, margin: 0, textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{v.full}</p>
                          <p style={{ color: "#94a3b8", fontSize: 11, margin: 0 }}>Tap to see price →</p>
                        </div>
                      </div>
                      <div className="flip-face flip-front" style={{ background: `linear-gradient(145deg,${v.dark},${v.color}90)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
                        <span style={{ fontSize: 36 }}>{v.emoji}</span>
                        <p style={{ color: "white", fontWeight: 900, fontSize: 16, margin: 0 }}>{v.label} Voucher</p>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ color: "rgba(255,255,255,0.85)", fontWeight: 900, fontSize: 26, margin: 0 }}>GH₵{v.price.toFixed(2)}</p>
                          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, margin: "2px 0 0" }}>Buy 11+ for GH₵{v.bulkPrice.toFixed(2)} each</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedId(v.id); setFlipped(null); }}
                          style={{ background: active ? "white" : "rgba(255,255,255,0.2)", color: active ? v.dark : "white", border: active ? "none" : "1px solid rgba(255,255,255,0.4)", borderRadius: 12, padding: "8px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all .2s" }}>
                          {active ? "✓ Selected" : "Select"}
                        </button>
                      </div>
                    </div>
                    {active && !isFlipped && (
                      <div style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: v.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontWeight: 900, zIndex: 2, animation: "cardCheck .25s cubic-bezier(.22,1,.36,1)" }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step 2 — Quantity */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .2s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${isBulk ? "rgba(245,158,11,0.4)" : D.border}`, borderRadius: 22, padding: 20, transition: "border-color .3s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "white", flexShrink: 0 }}>2</div>
              <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Quantity (max 50)</p>
              {isBulk && (
                <span style={{ fontSize: 11, fontWeight: 800, background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(245,158,11,0.3)" }}>
                  Bulk price: GH₵{selected.bulkPrice}/each
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="qty-btn" onClick={() => changeQty(quantity - 1)} disabled={quantity <= 1}
                style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: "transparent", color: quantity <= 1 ? D.muted : D.text, fontSize: 24, fontWeight: 700, cursor: quantity <= 1 ? "not-allowed" : "pointer", transition: "all .15s", flexShrink: 0 }}>−</button>
              <input
                type="number" min={1} max={50} value={quantity}
                onChange={e => changeQty(parseInt(e.target.value) || 1)}
                style={{ width: 64, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: "#050b15", color: D.text, fontSize: 22, fontWeight: 900, textAlign: "center", outline: "none", flexShrink: 0 }}
              />
              <button className="qty-btn" onClick={() => changeQty(quantity + 1)} disabled={quantity >= 50}
                style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: "transparent", color: quantity >= 50 ? D.muted : D.text, fontSize: 24, fontWeight: 700, cursor: quantity >= 50 ? "not-allowed" : "pointer", transition: "all .15s", flexShrink: 0 }}>+</button>
              <div style={{ flex: 1, background: "#050b15", borderRadius: 14, padding: "10px 14px", border: `1px solid ${D.border}` }}>
                <p style={{ color: D.muted, fontSize: 11, margin: "0 0 2px" }}>
                  GH₵{effectivePrice.toFixed(2)}/each
                  {hasDiscount && <span style={{ color: D.muted, textDecoration: "line-through", marginLeft: 6, fontSize: 10 }}>GH₵{selected.price.toFixed(2)}</span>}
                </p>
                <p style={{ color: selected.color, fontWeight: 900, fontSize: 20, margin: 0, transition: "color .2s" }}>GH₵{subtotal.toFixed(2)}</p>
              </div>
            </div>
            {!hasDiscount && bulkLeft > 0 && (
              <p style={{ color: D.muted, fontSize: 11, marginTop: 10, textAlign: "center" }}>
                Add <strong style={{ color: "#f59e0b" }}>{bulkLeft} more</strong> to unlock bulk price (GH₵{selected.bulkPrice}/each)
              </p>
            )}
          </div>
        </div>

        {/* Step 3 — Promo code (optional) */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .25s cubic-bezier(.22,1,.36,1)" }}>
          <button
            onClick={() => setShowPromo(v => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: D.card, border: `1px solid ${promoApplied ? "rgba(34,197,94,0.4)" : D.border}`, borderRadius: showPromo ? "18px 18px 0 0" : 18, padding: "14px 20px", cursor: "pointer", color: D.text, fontSize: 13, fontWeight: 700, transition: "all .25s" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>🏷️</span>
              <span>Have a discount code?</span>
              {promoApplied && <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 800 }}>✓ Applied</span>}
            </span>
            <span style={{ color: D.muted, fontSize: 16, transition: "transform .25s", display: "inline-block", transform: showPromo ? "rotate(180deg)" : "none" }}>⌄</span>
          </button>
          {showPromo && (
            <div style={{ background: D.card, border: `1px solid ${promoApplied ? "rgba(34,197,94,0.4)" : D.border}`, borderTop: "none", borderRadius: "0 0 18px 18px", padding: "0 20px 16px" }}>
              {promoApplied ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "10px 14px" }}>
                  <p style={{ color: "#4ade80", fontSize: 13, fontWeight: 700, margin: 0 }}>✓ Discount code applied — GH₵18 each</p>
                  <button onClick={clearPromo} style={{ color: D.muted, fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <input
                    type="text" placeholder="Enter code"
                    value={promoCode}
                    onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoMsg(null); }}
                    onKeyDown={e => { if (e.key === "Enter") void applyPromoCode(); }}
                    style={{ flex: 1, background: "#050b15", border: `1px solid ${D.border}`, borderRadius: 12, padding: "12px 14px", color: D.text, fontSize: 14, fontWeight: 700, outline: "none", letterSpacing: 2 }}
                  />
                  <button
                    onClick={() => void applyPromoCode()}
                    disabled={promoChecking || !promoCode.trim()}
                    style={{ padding: "12px 20px", borderRadius: 12, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "white", border: "none", fontSize: 13, fontWeight: 800, cursor: promoChecking || !promoCode.trim() ? "not-allowed" : "pointer", opacity: promoChecking || !promoCode.trim() ? 0.6 : 1 }}>
                    {promoChecking ? "…" : "Apply"}
                  </button>
                </div>
              )}
              {promoMsg && !promoApplied && (
                <p style={{ color: promoMsg.ok ? "#4ade80" : "#f87171", fontSize: 12, fontWeight: 700, margin: "8px 0 0" }}>
                  {promoMsg.ok ? "✓" : "⚠️"} {promoMsg.text}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step 4 — Phone */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .3s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${phoneFocus ? selected.color : D.border}`, borderRadius: 22, padding: 20, transition: "border-color .25s", boxShadow: phoneFocus ? `0 0 0 3px ${selected.color}20` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "white" }}>3</div>
              <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Your Phone Number</p>
            </div>
            <p style={{ color: D.muted, fontSize: 12, margin: "0 0 12px" }}>📱 Voucher codes will be sent here via SMS</p>
            <input
              type="tel" placeholder="0241234567" value={phone}
              onChange={e => {
                const raw = e.target.value;
                setPhone(raw);
                if (!raw.replace(/[\s\-\(\)]/g, "")) { setPhoneError(""); return; }
                const norm = normalizeGhana(raw);
                if (norm.length < 10) { setPhoneError(""); return; } // still typing
                setPhoneError(/^0[2-5][0-9]{8}$/.test(norm) ? "" : "Enter a valid Ghana number (e.g. 0241234567 or +233241234567).");
              }}
              onFocus={() => setPhoneFocus(true)}
              onBlur={() => setPhoneFocus(false)}
              style={{ width: "100%", background: "#050b15", border: `1px solid ${phoneError ? "#f87171" : phoneFocus ? selected.color : D.border}`, borderRadius: 14, padding: "15px 18px", color: D.text, fontSize: 18, outline: "none", boxSizing: "border-box", transition: "border-color .2s", letterSpacing: 1 }}
            />
            {phoneError && (
              <p style={{ color: "#f87171", fontSize: 12, fontWeight: 600, margin: "8px 0 0" }}>⚠️ {phoneError}</p>
            )}
            {phoneValid && !phoneError && (
              <p style={{ color: "#4ade80", fontSize: 12, fontWeight: 600, margin: "8px 0 0" }}>✓ Valid Ghana number</p>
            )}
          </div>
        </div>

        {/* Order summary */}
        <div style={{ background: `${selected.color}08`, border: `1px solid ${selected.color}30`, borderRadius: 18, padding: "16px 20px", marginBottom: 16, transition: "all .3s", opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transitionDelay: ".4s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ color: D.muted, fontSize: 11, margin: "0 0 3px" }}>Order Summary</p>
              <p style={{ color: D.text, fontWeight: 800, fontSize: 15, margin: 0 }}>{selected.label} × {quantity}</p>
              {hasDiscount && (
                <p style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, margin: "3px 0 0" }}>
                  {isBulk && !promoApplied ? "Bulk discount" : "Discount code"} · save GH₵{((selected.price - effectivePrice) * quantity).toFixed(2)} total
                </p>
              )}
              <p style={{ color: D.muted, fontSize: 11, margin: "3px 0 0" }}>incl. 2% processing fee</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: D.muted, fontSize: 11, margin: "0 0 3px" }}>Total</p>
              <p style={{ color: selected.color, fontWeight: 900, fontSize: 24, margin: 0, transition: "color .2s" }}>GH₵{total.toFixed(2)}</p>
              {hasDiscount && (
                <p style={{ color: D.muted, fontSize: 10, textDecoration: "line-through", margin: "2px 0 0" }}>
                  GH₵{parseFloat((selected.price * quantity * 1.02).toFixed(2)).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 14, padding: "12px 16px", marginBottom: 14, color: "#f87171", fontSize: 13, animation: "slideUp .3s ease" }}>
            ⚠️ {error}
          </div>
        )}

        {/* Pay button */}
        <button
          className="pay-btn"
          onClick={handlePay}
          disabled={!canPay}
          style={{
            width: "100%",
            background: canPay ? `linear-gradient(135deg,${selected.color},${selected.dark})` : "#1a2a45",
            color: canPay ? "white" : D.muted,
            border: "none", borderRadius: 18,
            padding: "18px 0", fontSize: 18, fontWeight: 900,
            cursor: canPay ? "pointer" : "not-allowed",
            transition: "all .25s cubic-bezier(.22,1,.36,1)",
            boxShadow: canPay ? `0 8px 32px ${selected.glow}` : "none",
            animation: canPay ? `glowPulse 2.5s ease-in-out infinite` : "none",
            "--glow-color": selected.glow,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(24px)",
          } as React.CSSProperties}
        >
          {loading ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 18, height: 18, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
              Processing…
            </span>
          ) : !paystackReady ? "Loading payment…" : `Pay GH₵${total.toFixed(2)} ⚡`}
        </button>

        <p style={{ color: D.muted, fontSize: 11, textAlign: "center", margin: "14px 0 0", opacity: mounted ? 1 : 0, transition: "opacity .5s .6s" }}>
          🔒 Secured by Paystack · Your data is safe
        </p>
      </div>
    </div>
  );
}
