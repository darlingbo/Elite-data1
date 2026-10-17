"use client";
import { PLATFORM_FEE_RATE } from "@/lib/pricing";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { detectGhProvider, normalizeGhPhone } from "@/lib/phone";
import { MOMO_NETWORKS, type MomoNetwork } from "@/lib/ed-networks";
import Icon from "@/components/ed/Icon";

const VOUCHER_META = [
  { id: "BECE" as const, label: "BECE", full: "Basic Education Certificate Examination" },
  { id: "WASSCE" as const, label: "WASSCE", full: "West African Senior School Certificate Examination" },
];

type VoucherID = "BECE" | "WASSCE";
type VoucherEntry = (typeof VOUCHER_META)[number] & { price: number; bulkPrice: number; bulkThreshold: number };

const money = (n: number) => `GH₵${n.toFixed(2)}`;
const spaced = (p: string) => p.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");

function normalizeGhana(raw: string): string {
  let v = raw.replace(/[\s\-()]/g, "");
  if (v.startsWith("+233")) v = v.slice(4);
  else if (v.startsWith("233")) v = v.slice(3);
  if (!v.startsWith("0")) v = "0" + v;
  return v;
}

const HOW_TO_BUY = [
  "Choose BECE or WASSCE.",
  "Pick how many vouchers you need. Buying 11 or more unlocks the bulk price of GH₵18 each.",
  "Enter the phone number the voucher codes should be sent to by SMS.",
  "Pay with Mobile Money. Choose your network, type your own Mobile Money number and approve the prompt.",
];

function VouchersPage() {
  const [selectedId, setSelectedId] = useState<VoucherID>("BECE");
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState("");
  const [serviceMode, setServiceMode] = useState<"voucher_only" | "assisted_result">("voucher_only");
  const [candidateName, setCandidateName] = useState("");
  const [candidateType, setCandidateType] = useState<"school" | "private">("school");
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [indexNumber, setIndexNumber] = useState("");
  const [confirmIndexNumber, setConfirmIndexNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [consent, setConsent] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ reference: string; pendingApproval: boolean } | null>(null);
  const [momoNetwork, setMomoNetwork] = useState<MomoNetwork | null>(null);
  const [momoPhone, setMomoPhone] = useState("");
  const [confirmNetwork, setConfirmNetwork] = useState(false);
  const [vouchers, setVouchers] = useState<VoucherEntry[]>(VOUCHER_META.map((m) => ({ ...m, price: 19, bulkPrice: 18, bulkThreshold: 10 })));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (stopRef.current) { clearTimeout(stopRef.current); stopRef.current = null; }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    fetch("/api/vouchers/prices")
      .then((r) => r.json())
      .then((data: Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number }>) => {
        setVouchers(VOUCHER_META.map((m) => ({ ...m, price: data[m.id]?.sellPrice ?? 19, bulkPrice: data[m.id]?.bulkPrice ?? 18, bulkThreshold: data[m.id]?.bulkThreshold ?? 10 })));
      })
      .catch(() => {});
  }, []);

  const selected = vouchers.find((v) => v.id === selectedId)!;
  const isAssisted = serviceMode === "assisted_result";
  const isBulk = !isAssisted && quantity > selected.bulkThreshold;
  const hasDiscount = !isAssisted && (isBulk || promoApplied);
  const effectivePrice = hasDiscount ? selected.bulkPrice : selected.price;
  const subtotal = isAssisted ? 25 : parseFloat((effectivePrice * quantity).toFixed(2));
  const fee = isAssisted ? 0 : parseFloat((subtotal * PLATFORM_FEE_RATE).toFixed(2));
  const total = parseFloat((subtotal + fee).toFixed(2));
  const normalizedPhone = normalizeGhana(isAssisted ? whatsapp : phone);
  const phoneValid = /^0[2-5][0-9]{8}$/.test(normalizedPhone);
  const needsDob = (selectedId === "WASSCE" && candidateType === "private") || (selectedId === "BECE" && candidateType === "school");
  const candidateValid =
    candidateName.trim().length >= 2 && /^(?:\d[\s-]*){6,14}$/.test(indexNumber.trim()) && indexNumber.trim() === confirmIndexNumber.trim() &&
    /^\d{4}$/.test(examYear) && Number(examYear) >= 1990 && Number(examYear) <= new Date().getFullYear() &&
    (!needsDob || /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) && consent;
  const bulkLeft = selected.bulkThreshold + 1 - quantity;

  const momoClean = normalizeGhPhone(momoPhone);
  const detected = momoClean ? detectGhProvider(momoClean) : null;
  const networkLooksWrong = !!(momoNetwork && detected && detected !== momoNetwork);
  const labelOf = (id: MomoNetwork | null) => MOMO_NETWORKS.find((n) => n.id === id)?.label ?? "";
  const canPay = phoneValid && !phoneError && (!isAssisted || candidateValid) && !!momoNetwork && !!momoClean && (!networkLooksWrong || confirmNetwork) && !loading;

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) { setPromoMsg({ ok: false, text: "Enter a discount code first." }); return; }
    setPromoChecking(true); setPromoMsg(null);
    try {
      const data = (await fetch(`/api/vouchers/prices?code=${encodeURIComponent(code)}`).then((r) => r.json())) as Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number; promoApplied: boolean }>;
      if (Object.values(data).some((v) => v.promoApplied)) {
        setPromoApplied(true);
        setVouchers(VOUCHER_META.map((m) => ({ ...m, price: data[m.id]?.sellPrice ?? 19, bulkPrice: data[m.id]?.bulkPrice ?? 18, bulkThreshold: data[m.id]?.bulkThreshold ?? 10 })));
        setPromoMsg({ ok: true, text: "Discount code applied. GH₵18 each." });
      } else { setPromoApplied(false); setPromoMsg({ ok: false, text: "That discount code is invalid or has expired." }); }
    } catch { setPromoMsg({ ok: false, text: "Could not check the code. Try again." }); }
    setPromoChecking(false);
  }

  function clearPromo() {
    setPromoCode(""); setPromoApplied(false); setPromoMsg(null);
    fetch("/api/vouchers/prices").then((r) => r.json()).then((data: Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number }>) => {
      setVouchers(VOUCHER_META.map((m) => ({ ...m, price: data[m.id]?.sellPrice ?? 19, bulkPrice: data[m.id]?.bulkPrice ?? 18, bulkThreshold: data[m.id]?.bulkThreshold ?? 10 })));
    }).catch(() => {});
  }

  async function handlePay() {
    setError("");
    if (!canPay || !momoNetwork || !momoClean) return;
    const cleaned = normalizedPhone;
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setError("Enter a valid Ghana phone number, for example 0241234567."); return; }
    if (isAssisted && !candidateValid) { setError("Complete all candidate details, confirm the index number and accept the authorisation."); return; }
    setLoading(true);

    try {
      const ybkRes = await fetch("/api/yebeck/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: total,
          phone: momoClean,
          network: momoNetwork,
          confirmNetwork: networkLooksWrong && confirmNetwork,
          type: "voucher_order",
          name: candidateName.trim() || "Customer",
          metadata: { voucherType: selected.id, quantity: isAssisted ? 1 : quantity, phone: cleaned },
        }),
      });
      const ybkData = await ybkRes.json();
      if (!ybkRes.ok || !ybkData.ok) {
        setLoading(false);
        setError(ybkData.message || "We could not send the Mobile Money prompt. Please check your number and network.");
        return;
      }

      const ybkRef = ybkData.reference as string;
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const sRes = await fetch(`/api/yebeck/status?reference=${encodeURIComponent(ybkRef)}`);
          const sData = await sRes.json();
          if (sData.status === "success") {
            stopPolling();
            const cr = await fetch("/api/vouchers/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: candidateName.trim() || "Customer",
                email: `${cleaned}@voucher.elitedata.com`,
                phone: cleaned,
                voucherType: selected.id,
                quantity: isAssisted ? 1 : quantity,
                paymentRef: ybkRef,
                promoCode: !isAssisted && promoApplied ? promoCode.trim() : undefined,
                serviceMode,
                candidateName: candidateName.trim(),
                candidateType,
                examYear,
                indexNumber: indexNumber.trim(),
                confirmIndexNumber: confirmIndexNumber.trim(),
                dateOfBirth: needsDob ? dateOfBirth : undefined,
                whatsapp: cleaned,
                consent,
              }),
            });
            const d = await cr.json();
            setLoading(false);
            if (d.success) setSuccess({ reference: d.reference, pendingApproval: d.pendingApproval !== false });
            else setError(d.error || `Payment received. Please contact support with your reference: ${ybkRef}`);
          } else if (sData.status === "failed") {
            stopPolling(); setLoading(false);
            setError("The payment was declined or cancelled on your phone. Please try again.");
          }
        } catch { /* keep polling */ }
      }, 1800);
      stopRef.current = setTimeout(() => { stopPolling(); setLoading(false); setError("The payment timed out. If you already approved it, contact support with your phone number."); }, 180000);
    } catch {
      setLoading(false);
      setError("We could not start the payment. Check your connection and try again.");
    }
  }

  if (success) {
    return (
      <div className="ed-page" style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <div className="ed-stack" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.14)", color: "var(--ed-green)", display: "grid", placeItems: "center", margin: "0 auto" }}><Icon name="check" /></div>
          <h1 className="ed-h2">{success.pendingApproval ? "Order received" : "Voucher order sent"}</h1>
          <p className="ed-muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Your {isAssisted ? `${selected.label} assisted result check` : `${selected.label} x ${quantity}`} order is confirmed.
            {success.pendingApproval
              ? (isAssisted ? " It is waiting for approval. After that we check the result and send it to WhatsApp." : " It is waiting for approval. The voucher code is sent by SMS after delivery.")
              : (isAssisted ? " The result check is being processed and goes to WhatsApp." : " Delivery is being processed and the voucher code comes by SMS shortly.")}{" "}
            Recipient: <b className="ed-num" style={{ color: "var(--ed-text)" }}>{spaced(normalizedPhone)}</b>
          </p>
          <div className="ed-quote" style={{ textAlign: "left" }}><small>Order reference</small><b style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{success.reference}</b></div>
          <Link href={`/track?ref=${encodeURIComponent(success.reference)}`} className="ed-btn y tall block">Track my order</Link>
          <a href="/vouchers" className="ed-link" style={{ minHeight: 44, display: "grid", placeItems: "center" }}>Buy another voucher</a>
        </div>
      </div>
    );
  }

  const inputStyle = { width: "100%", minHeight: 52, borderRadius: 12, border: "1px solid var(--ed-line2)", background: "var(--ed-card)", color: "var(--ed-text)", padding: "0 12px", fontSize: 16, fontFamily: "var(--ed-body)" } as const;
  const label = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--ed-muted)", marginBottom: 6 } as const;

  return (
    <div className="ed-page" style={{ paddingBottom: 100 }}>
      <div className="ed-wrap ed-stack" style={{ paddingTop: 22, gap: 26 }}>
        <div className="ed-stack" style={{ gap: 8 }}>
          <h1 className="ed-h1" style={{ fontSize: "clamp(26px,7vw,40px)" }}>Result checker vouchers</h1>
          <p className="ed-muted" style={{ margin: 0 }}>Buy BECE and WASSCE result checker vouchers online in Ghana. Voucher details are sent by SMS after approval.</p>
        </div>

        <section aria-labelledby="how-h">
          <h2 id="how-h" className="ed-h2" style={{ fontSize: 20, marginBottom: 6 }}>How it works</h2>
          <div className="ed-how">{HOW_TO_BUY.map((s, i) => <div key={i}><i>{i + 1}</i><span>{s}</span></div>)}</div>
        </section>

        <section aria-labelledby="exam-h" className="ed-stack" style={{ gap: 10 }}>
          <h2 id="exam-h" className="ed-h2" style={{ fontSize: 20 }}>Choose the exam</h2>
          <div className="ed-grid2" style={{ gridTemplateColumns: "1fr 1fr" }} role="radiogroup" aria-label="Exam type">
            {vouchers.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={selectedId === v.id} className={`ed-tile${selectedId === v.id ? " sel" : ""}`} style={{ ["--ed-net" as string]: "var(--ed-yellow)" }} onClick={() => setSelectedId(v.id)}>
                <span className="sz">{v.label}</span>
                <span className="vd">{v.full}</span>
                <span className="pr">{money(v.price)}</span>
                <span className="pg">{money(v.bulkPrice)} each for 11 or more</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="svc-h" className="ed-stack" style={{ gap: 10 }}>
          <h2 id="svc-h" className="ed-h2" style={{ fontSize: 20 }}>Choose a service</h2>
          <div className="ed-grid2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }} role="radiogroup" aria-label="Service">
            {([
              { id: "voucher_only", title: "Voucher only", text: `Receive the ${selected.label} voucher by SMS`, price: `${money(selected.price)} each` },
              { id: "assisted_result", title: "Check my result for me", text: "We check your result and send it to WhatsApp", price: "GH₵25 total" },
            ] as const).map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={serviceMode === o.id} className={`ed-tile${serviceMode === o.id ? " sel" : ""}`} style={{ ["--ed-net" as string]: "var(--ed-yellow)", paddingTop: 14 }}
                onClick={() => { setServiceMode(o.id); setError(""); if (o.id === "assisted_result") { setQuantity(1); clearPromo(); } }}>
                <span className="sz" style={{ fontSize: 18 }}>{o.title}</span>
                <span className="vd" style={{ fontSize: 12 }}>{o.text}</span>
                <span className="pr">{o.price}</span>
              </button>
            ))}
          </div>
        </section>

        {isAssisted && (
          <section aria-labelledby="cand-h" className="ed-stack" style={{ gap: 12 }}>
            <h2 id="cand-h" className="ed-h2" style={{ fontSize: 20 }}>Candidate details</h2>
            <p className="ed-muted" style={{ margin: 0, fontSize: 13 }}>Enter the information exactly as it appears on the examination record.</p>
            <div className="ed-stack" style={{ gap: 12 }}>
              <div><label style={label} htmlFor="c_name">Candidate full name</label><input id="c_name" style={inputStyle} value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Full name on the exam record" /></div>
              <div><label style={label} htmlFor="c_type">Candidate type</label><select id="c_type" style={inputStyle} value={candidateType} onChange={(e) => setCandidateType(e.target.value as "school" | "private")}><option value="school">School candidate</option><option value="private">Private candidate</option></select></div>
              <div><label style={label} htmlFor="c_year">Examination year</label><input id="c_year" style={inputStyle} type="number" min="1990" max={new Date().getFullYear()} value={examYear} onChange={(e) => setExamYear(e.target.value)} /></div>
              <div><label style={label} htmlFor="c_idx">Index number</label><input id="c_idx" style={inputStyle} inputMode="numeric" value={indexNumber} onChange={(e) => setIndexNumber(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Candidate index number" /></div>
              <div><label style={label} htmlFor="c_idx2">Confirm index number</label><input id="c_idx2" style={inputStyle} inputMode="numeric" value={confirmIndexNumber} onChange={(e) => setConfirmIndexNumber(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Enter the index number again" /></div>
              {needsDob && <div><label style={label} htmlFor="c_dob">Date of birth</label><input id="c_dob" style={inputStyle} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>}
              <div><label style={label} htmlFor="c_wa">WhatsApp number for the result</label><input id="c_wa" style={inputStyle} type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="024 123 4567" /></div>
              <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 13, color: "var(--ed-muted)", lineHeight: 1.5, cursor: "pointer", minHeight: 44 }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
                I allow Elite Data to use these details and one result checker voucher only to check my result and send it to my WhatsApp number.
              </label>
            </div>
          </section>
        )}

        {!isAssisted && (
          <section aria-labelledby="qty-h" className="ed-stack" style={{ gap: 10 }}>
            <h2 id="qty-h" className="ed-h2" style={{ fontSize: 20 }}>How many?</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" className="ed-ibtn" style={{ width: 52, height: 52, fontSize: 24 }} aria-label="One fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>−</button>
              <input aria-label="Quantity" type="number" min={1} max={50} value={quantity} onChange={(e) => setQuantity(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} style={{ ...inputStyle, width: 76, textAlign: "center", fontSize: 22, fontWeight: 900, fontFamily: "var(--ed-display)" }} />
              <button type="button" className="ed-ibtn" style={{ width: 52, height: 52, fontSize: 24 }} aria-label="One more" onClick={() => setQuantity((q) => Math.min(50, q + 1))} disabled={quantity >= 50}>+</button>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div className="ed-muted ed-num" style={{ fontSize: 12 }}>{money(effectivePrice)} each{hasDiscount && <s style={{ marginLeft: 6 }}>{money(selected.price)}</s>}</div>
                <b className="ed-display ed-num" style={{ fontSize: 24 }}>{money(subtotal)}</b>
              </div>
            </div>
            {isBulk && <p className="ed-chk ok" style={{ margin: 0 }}>Bulk price applied: {money(selected.bulkPrice)} each.</p>}
            {!hasDiscount && bulkLeft > 0 && <p className="ed-muted" style={{ margin: 0, fontSize: 12 }}>Add {bulkLeft} more to unlock the bulk price of {money(selected.bulkPrice)} each.</p>}

            <details style={{ borderTop: "1px solid var(--ed-line)", paddingTop: 6 }}>
              <summary style={{ minHeight: 48, display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Have a discount code?{promoApplied && <span style={{ color: "var(--ed-green)", marginLeft: 8 }}>Applied</span>}</summary>
              {promoApplied ? (
                <div className="ed-chk ok" style={{ justifyContent: "space-between", alignItems: "center" }}>Discount code applied. {money(selected.bulkPrice)} each.<button type="button" onClick={clearPromo} style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", minHeight: 44, font: "inherit" }}>Remove</button></div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input aria-label="Discount code" style={{ ...inputStyle, letterSpacing: 2, fontWeight: 700 }} placeholder="CODE" value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoMsg(null); }} onKeyDown={(e) => { if (e.key === "Enter") void applyPromoCode(); }} />
                  <button type="button" className="ed-btn y" style={{ minHeight: 52 }} disabled={promoChecking || !promoCode.trim()} onClick={() => void applyPromoCode()}>{promoChecking ? "…" : "Apply"}</button>
                </div>
              )}
              {promoMsg && !promoApplied && <p className={`ed-chk ${promoMsg.ok ? "ok" : "bad"}`} style={{ margin: "8px 0 0" }}>{promoMsg.text}</p>}
            </details>
          </section>
        )}

        {!isAssisted && (
          <section aria-labelledby="ph-h" className="ed-stack" style={{ gap: 8 }}>
            <h2 id="ph-h" className="ed-h2" style={{ fontSize: 20 }}>Where should the codes go?</h2>
            <label style={label} htmlFor="v_phone">Phone number that receives the voucher codes by SMS</label>
            <div className={`ed-nin${phoneError ? " bad" : phoneValid ? " ok" : ""}`}>
              <input id="v_phone" type="tel" inputMode="tel" placeholder="024 123 4567" value={phone}
                onChange={(e) => {
                  const raw = e.target.value; setPhone(raw);
                  if (!raw.replace(/[\s\-()]/g, "")) { setPhoneError(""); return; }
                  const norm = normalizeGhana(raw);
                  if (norm.length < 10) { setPhoneError(""); return; }
                  setPhoneError(/^0[2-5][0-9]{8}$/.test(norm) ? "" : "Enter a valid Ghana number, for example 0241234567.");
                }} />
            </div>
            {phoneError && <p className="ed-chk bad" style={{ margin: 0 }}>{phoneError}</p>}
          </section>
        )}

        <section className="ed-paper" style={{ borderRadius: 22, padding: 18, display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="pay-h">
          <h2 id="pay-h" className="ed-h2" style={{ fontSize: 22, color: "var(--ed-ink)" }}>Pay with Mobile Money</h2>
          <div className="ed-sum">
            <div className="r"><span>Order</span><b>{isAssisted ? `${selected.label} result check` : `${selected.label} x ${quantity}`}</b></div>
            {hasDiscount && <div className="r"><span>Discount</span><b>-{money((selected.price - effectivePrice) * quantity)}</b></div>}
            {!isAssisted && fee > 0 && <div className="r"><span>Processing fee</span><b>{money(fee)}</b></div>}
            <div className="r tot"><span>Total</span><b>{money(total)}</b></div>
          </div>

          <div role="radiogroup" aria-label="Your Mobile Money network">
            <span className="lt">Your Mobile Money network</span>
            <div className="ed-nets3">
              {MOMO_NETWORKS.map((n) => (
                <button key={n.id} type="button" role="radio" aria-checked={momoNetwork === n.id} className="ed-net3" onClick={() => { setMomoNetwork(n.id); setConfirmNetwork(false); }}><i style={{ background: n.color }} />{n.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="v_momo" className="lt">Your Mobile Money number</label>
            <input id="v_momo" className={`ed-input${networkLooksWrong ? " warn" : ""}`} type="tel" inputMode="tel" disabled={!momoNetwork} value={momoPhone}
              onChange={(e) => { setMomoPhone(e.target.value); setConfirmNetwork(false); }} placeholder={momoNetwork ? "024 123 4567" : "Choose your network first"} />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ed-g500)" }}>This is the number that pays. It can be different from the number that receives the voucher.</p>
          </div>
          {networkLooksWrong && detected && momoNetwork && (
            <div className="ed-note warn" role="alert">
              <b>{spaced(momoClean ?? "")} looks like a {labelOf(detected)} number.</b> Choose {labelOf(detected)}, or confirm it is on {labelOf(momoNetwork)}.
              <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, minHeight: 44, fontWeight: 700 }}>
                <input type="checkbox" checked={confirmNetwork} onChange={(e) => setConfirmNetwork(e.target.checked)} style={{ width: 22, height: 22 }} />This number is on {labelOf(momoNetwork)}
              </label>
            </div>
          )}
          {momoNetwork && momoClean && (!networkLooksWrong || confirmNetwork) && phoneValid && (
            <div className="ed-note">The payment prompt goes to <b>{spaced(momoClean)}</b>. The {isAssisted ? "result goes to WhatsApp on" : "voucher codes go to"} <b>{spaced(normalizedPhone)}</b>.</div>
          )}
          {error && <div className="ed-note bad" role="alert">{error}</div>}
          <button type="button" className={`ed-btn tall block ${canPay ? "b" : "dis paper"}`} disabled={!canPay} onClick={() => void handlePay()}>
            {loading ? "Waiting for your PIN…" : `Pay ${money(total)}`}
          </button>
          <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: "var(--ed-g500)" }}>Secure Mobile Money payment. Your voucher is delivered once the payment is approved.</p>
        </section>
      </div>
    </div>
  );
}

export default VouchersPage;
