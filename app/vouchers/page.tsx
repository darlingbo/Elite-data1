"use client";
import { useState, useEffect } from "react";

const VOUCHERS = [
  { id: "BECE",   label: "BECE",   full: "Basic Education Certificate Examination",           price: 18, color: "#3b82f6", dark: "#1d4ed8", glow: "rgba(59,130,246,0.4)",  emoji: "📗" },
  { id: "WASSCE", label: "WASSCE", full: "West African Senior School Certificate Examination", price: 18, color: "#8b5cf6", dark: "#6d28d9", glow: "rgba(139,92,246,0.4)", emoji: "📘" },
] as const;

type VoucherID = typeof VOUCHERS[number]["id"];

const D = { bg: "#080d18", card: "#0d1525", border: "#1a2a45", text: "#e2e8f0", muted: "#64748b" };

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

export default function VouchersPage() {
  const [selectedId, setSelectedId] = useState<VoucherID>("BECE");
  const [quantity, setQuantity]     = useState(1);
  const [phone, setPhone]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState<{ reference: string } | null>(null);
  const [mounted, setMounted]       = useState(false);
  const [qtyBump, setQtyBump]       = useState(false);
  const [phoneFocus, setPhoneFocus] = useState(false);
  const paystackReady               = usePaystackReady();

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const selected = VOUCHERS.find(v => v.id === selectedId)!;
  const subtotal = selected.price * quantity;
  const fee      = parseFloat((subtotal * 0.02).toFixed(2));
  const total    = parseFloat((subtotal + fee).toFixed(2));
  const canPay   = !!phone && paystackReady && !loading;

  function changeQty(delta: number) {
    setQuantity(q => Math.min(10, Math.max(1, q + delta)));
    setQtyBump(true);
    setTimeout(() => setQtyBump(false), 300);
  }

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
          @keyframes successPop { 0%{transform:scale(0) rotate(-15deg);opacity:0} 60%{transform:scale(1.15) rotate(5deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
          @keyframes confettiDrop { 0%{transform:translateY(-20px) rotate(0);opacity:1} 100%{transform:translateY(60px) rotate(360deg);opacity:0} }
          @keyframes fadeSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
          @keyframes ringPulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)} 50%{box-shadow:0 0 0 16px rgba(34,197,94,0)} }
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
        @keyframes floatIcon { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-8px) rotate(2deg)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse { 0%,100%{box-shadow:0 0 20px var(--glow-color,rgba(59,130,246,0.3))} 50%{box-shadow:0 0 40px var(--glow-color,rgba(59,130,246,0.6)), 0 0 80px var(--glow-color,rgba(59,130,246,0.2))} }
        @keyframes qtyPop    { 0%{transform:scale(1)} 40%{transform:scale(1.4)} 100%{transform:scale(1)} }
        @keyframes orb1      { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.2)} 66%{transform:translate(-40px,30px) scale(0.9)} }
        @keyframes orb2      { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-50px,50px) scale(0.8)} 66%{transform:translate(70px,-20px) scale(1.1)} }
        @keyframes shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes cardCheck { from{transform:scale(0) rotate(-10deg);opacity:0} to{transform:scale(1) rotate(0);opacity:1} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        .pay-btn:not(:disabled):hover { transform:translateY(-2px) !important; }
        .pay-btn:not(:disabled):active { transform:translateY(0px) scale(.98) !important; }
        .voucher-card:hover  { transform:translateY(-2px); }
        .qty-btn:hover       { background: rgba(255,255,255,0.1) !important; }
      `}</style>

      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "5%", left: "10%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 70%)", animation: "orb1 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,0.1) 0%,transparent 70%)", animation: "orb2 15s ease-in-out infinite" }} />
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "32px 16px 100px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(20px)", transition: "all .6s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 22, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", fontSize: 34, marginBottom: 16, animation: "floatIcon 3s ease-in-out infinite", boxShadow: "0 8px 32px rgba(139,92,246,0.4)" }}>
            📋
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 6px", background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Result Checker Vouchers
          </h1>
          <p style={{ color: D.muted, fontSize: 13, margin: 0 }}>BECE & WASSCE · Instant SMS delivery · GH₵18 each</p>
        </div>

        {/* Step 1 — Exam type */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .1s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 22, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "white" }}>1</div>
              <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Choose Exam Type</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {VOUCHERS.map((v, i) => {
                const active = selectedId === v.id;
                return (
                  <button key={v.id} className="voucher-card" onClick={() => setSelectedId(v.id)} style={{
                    borderRadius: 18, padding: 18, border: `2px solid ${active ? v.color : D.border}`,
                    background: active ? `${v.color}12` : "transparent",
                    cursor: "pointer", textAlign: "left",
                    transition: "all .25s cubic-bezier(.22,1,.36,1)",
                    boxShadow: active ? `0 0 0 1px ${v.color}40, 0 8px 32px ${v.glow}` : "none",
                    position: "relative",
                    animationDelay: `${i * 0.1}s`,
                  }}>
                    {active && (
                      <div style={{ position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: "50%", background: v.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, animation: "cardCheck .25s cubic-bezier(.22,1,.36,1)" }}>✓</div>
                    )}
                    <span style={{ fontSize: 32, display: "block", marginBottom: 10, transition: "transform .2s", transform: active ? "scale(1.15)" : "scale(1)" }}>{v.emoji}</span>
                    <p style={{ fontSize: 16, fontWeight: 900, color: active ? v.color : D.text, margin: "0 0 4px", transition: "color .2s" }}>{v.label}</p>
                    <p style={{ fontSize: 10, color: D.muted, margin: "0 0 12px", lineHeight: 1.4 }}>{v.full}</p>
                    <p style={{ fontSize: 20, fontWeight: 900, color: v.color, margin: 0 }}>GH₵{v.price.toFixed(2)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step 2 — Quantity */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .2s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 22, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "white" }}>2</div>
              <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Quantity (1–10)</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="qty-btn" onClick={() => changeQty(-1)} disabled={quantity <= 1} style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: "transparent", color: quantity <= 1 ? D.muted : D.text, fontSize: 24, fontWeight: 700, cursor: quantity <= 1 ? "not-allowed" : "pointer", transition: "all .15s", flexShrink: 0 }}>−</button>
              <span style={{ fontSize: 32, fontWeight: 900, color: D.text, minWidth: 40, textAlign: "center", display: "inline-block", animation: qtyBump ? "qtyPop .3s cubic-bezier(.22,1,.36,1)" : "none" }}>{quantity}</span>
              <button className="qty-btn" onClick={() => changeQty(1)} disabled={quantity >= 10} style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${D.border}`, background: "transparent", color: quantity >= 10 ? D.muted : D.text, fontSize: 24, fontWeight: 700, cursor: quantity >= 10 ? "not-allowed" : "pointer", transition: "all .15s", flexShrink: 0 }}>+</button>
              <div style={{ flex: 1, background: "#050b15", borderRadius: 14, padding: "12px 16px", textAlign: "right", border: `1px solid ${D.border}` }}>
                <p style={{ color: D.muted, fontSize: 11, margin: "0 0 2px" }}>Subtotal</p>
                <p style={{ color: selected.color, fontWeight: 900, fontSize: 20, margin: 0, transition: "color .2s" }}>GH₵{subtotal.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 — Phone */}
        <div style={{ marginBottom: 16, opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transition: "all .55s .3s cubic-bezier(.22,1,.36,1)" }}>
          <div style={{ background: D.card, border: `1px solid ${phoneFocus ? selected.color : D.border}`, borderRadius: 22, padding: 20, transition: "border-color .25s", boxShadow: phoneFocus ? `0 0 0 3px ${selected.color}20` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "white" }}>3</div>
              <p style={{ fontSize: 12, fontWeight: 700, color: D.muted, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Your Phone Number</p>
            </div>
            <p style={{ color: D.muted, fontSize: 12, margin: "0 0 12px" }}>📱 Voucher codes will be sent here via SMS</p>
            <input
              type="tel" placeholder="0241234567" value={phone}
              onChange={e => setPhone(e.target.value)}
              onFocus={() => setPhoneFocus(true)}
              onBlur={() => setPhoneFocus(false)}
              style={{ width: "100%", background: "#050b15", border: `1px solid ${phoneFocus ? selected.color : D.border}`, borderRadius: 14, padding: "15px 18px", color: D.text, fontSize: 18, outline: "none", boxSizing: "border-box", transition: "border-color .2s", letterSpacing: 1 }}
            />
          </div>
        </div>

        {/* Order summary */}
        <div style={{ background: `${selected.color}08`, border: `1px solid ${selected.color}30`, borderRadius: 18, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all .3s", opacity: mounted ? 1 : 0, transform: mounted ? "translateY(0)" : "translateY(24px)", transitionDelay: ".4s" }}>
          <div>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 3px" }}>Order Summary</p>
            <p style={{ color: D.text, fontWeight: 800, fontSize: 15, margin: 0 }}>{selected.label} × {quantity}</p>
            <p style={{ color: D.muted, fontSize: 11, margin: "3px 0 0" }}>incl. 2% processing fee</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: D.muted, fontSize: 11, margin: "0 0 3px" }}>Total</p>
            <p style={{ color: selected.color, fontWeight: 900, fontSize: 24, margin: 0, transition: "color .2s" }}>GH₵{total.toFixed(2)}</p>
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
