"use client";
import { PLATFORM_FEE_RATE } from "@/lib/pricing";
import PaymentLate from "@/components/PaymentLate";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import type { Bundle } from "@/lib/bundles";
import { detectGhProvider, normalizeGhPhone } from "@/lib/phone";
import { MOMO_NETWORKS, NETWORK_META, type BuyNetwork, type MomoNetwork } from "@/lib/ed-networks";
import Icon from "@/components/ed/Icon";

const money = (n: number) => `GH₵${n.toFixed(2)}`;
const spaced = (p: string) => p.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");

function parsePhones(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/\s+/g, "").replace(/^\+233/, "0").replace(/^233/, "0"))
    .filter((s) => /^0[2-5][0-9]{8}$/.test(s));
}

interface Outcome { phone: string; ref: string; status: "pending_approval" | "failed"; }

function BusinessContent() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [network, setNetwork] = useState<BuyNetwork>("mtn");
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [phonesText, setPhonesText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [momoNetwork, setMomoNetwork] = useState<MomoNetwork | null>(null);
  const [momoPhone, setMomoPhone] = useState("");
  const [confirmNetwork, setConfirmNetwork] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lateRef, setLateRef] = useState<string | null>(null);
  const [lateBody, setLateBody] = useState<Record<string, unknown>>({});
  const [results, setResults] = useState<{ pendingApproval: number; failed: number; total: number; outcomes: Outcome[] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (stopRef.current) { clearTimeout(stopRef.current); stopRef.current = null; }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    fetch("/api/bundles").then((r) => r.json()).then((d) => setBundles(d.bundles ?? [])).catch(() => {});
  }, []);

  const uniquePhones = [...new Set(parsePhones(phonesText))];
  const allLines = phonesText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const invalidCount = allLines.length - uniquePhones.length;
  const filtered = bundles.filter((b) => b.network === network).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const unitTotal = selectedBundle ? parseFloat((selectedBundle.price * (1 + PLATFORM_FEE_RATE)).toFixed(2)) : 0;
  const grandTotal = parseFloat((unitTotal * uniquePhones.length).toFixed(2));
  const platformFee = parseFloat((selectedBundle ? selectedBundle.price * PLATFORM_FEE_RATE * uniquePhones.length : 0).toFixed(2));
  const meta = NETWORK_META[network];

  const cleanContact = normalizeGhPhone(contactPhone);
  const momoClean = normalizeGhPhone(momoPhone);
  const detected = momoClean ? detectGhProvider(momoClean) : null;
  const wrong = !!(momoNetwork && detected && detected !== momoNetwork);
  const labelOf = (id: MomoNetwork | null) => MOMO_NETWORKS.find((n) => n.id === id)?.label ?? "";
  const canPay = !!selectedBundle && uniquePhones.length >= 2 && !!cleanContact && !!momoNetwork && !!momoClean && (!wrong || confirmNetwork) && !loading;

  /** The payment is confirmed: use the orders the server made, or ask the server to make them. */
  async function finishPaid(answer: { order?: Record<string, unknown> }, ybkRef: string, createBody: Record<string, unknown>) {
    setLateRef(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let d: any = answer.order;
    if (!d || !d.success) {
      const res = await fetch("/api/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...createBody, paymentRef: ybkRef }),
      });
      d = await res.json();
    }
    setLoading(false);
    if (d?.success) setResults(d);
    else setError(d?.error || `The order failed. Contact support with reference ${ybkRef}.`);
  }

  async function handlePay() {
    if (!canPay || !selectedBundle || !momoNetwork || !momoClean || !cleanContact) return;
    setError("");
    setLoading(true);
    // What the bulk order needs. It is saved with the payment so the server can finish the order
    // itself if this page never sees "paid".
    const createBody = { phones: uniquePhones, bundleId: selectedBundle.id, companyName: companyName.trim() || null, contactPhone: cleanContact };
    try {
      const ybkRes = await fetch("/api/yebeck/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: grandTotal,
          phone: momoClean,
          network: momoNetwork,
          confirmNetwork: wrong && confirmNetwork,
          type: "bulk_order",
          name: companyName.trim() || "Business Customer",
          metadata: { phonesCount: uniquePhones.length, bundleId: selectedBundle.id, companyName: companyName.trim() || null, create_body: createBody },
        }),
      });
      const ybkData = await ybkRes.json();
      if (!ybkRes.ok || !ybkData.ok) {
        setLoading(false);
        setError(ybkData.message || "We could not send the Mobile Money prompt. Please try again.");
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
            await finishPaid(sData, ybkRef, createBody);
          } else if (sData.status === "failed") {
            stopPolling(); setLoading(false);
            setError("The payment was declined or cancelled on your phone. Please try again.");
          }
        } catch { /* keep polling */ }
      }, 2000);
      stopRef.current = setTimeout(() => { stopPolling(); setLoading(false); setLateBody(createBody); setLateRef(ybkRef); }, 300000);
    } catch {
      setLoading(false);
      setError("We could not start the payment. Check your connection and try again.");
    }
  }

  if (results) {
    const allOk = results.failed === 0;
    return (
      <div className="ed-page" style={{ padding: "28px 0 100px" }}>
        <div className="ed-wrap ed-stack" style={{ gap: 18 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(34,197,94,.14)", color: "var(--ed-green)", display: "grid", placeItems: "center" }}><Icon name="check" /></div>
          <h1 className="ed-h2">{allOk ? "Payment received" : `${results.pendingApproval} of ${results.total} queued`}</h1>
          <p className="ed-muted" style={{ margin: 0 }}>{allOk ? `${results.total} numbers are waiting for approval before delivery.` : `${results.failed} could not be queued. Our team has been told.`} Do not pay again. Delivery starts after approval.</p>
          <div>
            {results.outcomes.map((o) => (
              <div key={o.ref} className="ed-lrow" style={{ minHeight: 52 }}>
                <span className="t" style={{ flex: 1 }}><b className="ed-num" style={{ fontSize: 15 }}>{spaced(o.phone)}</b></span>
                <span className="ed-pill" style={o.status === "pending_approval" ? undefined : { background: "#fee2e2", color: "#991b1b" }}>{o.status === "pending_approval" ? "Waiting for approval" : "Failed"}</span>
              </div>
            ))}
          </div>
          {results.failed > 0 && <div className="ed-chk warn">Some paid numbers were not recorded safely. Our team has been alerted to queue them or refund the correct amount. <a href="https://wa.me/233509794503" target="_blank" rel="noopener noreferrer" className="ed-link">WhatsApp support</a></div>}
          <button type="button" className="ed-btn y tall block" onClick={() => { setResults(null); setStep(1); setSelectedBundle(null); setPhonesText(""); setContactPhone(""); setCompanyName(""); setMomoPhone(""); setMomoNetwork(null); }}>Place another order</button>
        </div>
      </div>
    );
  }

  const inputStyle = { width: "100%", minHeight: 52, borderRadius: 12, border: "1px solid var(--ed-line2)", background: "var(--ed-card)", color: "var(--ed-text)", padding: "0 12px", fontSize: 16, fontFamily: "var(--ed-body)" } as const;
  const label = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--ed-muted)", marginBottom: 6 } as const;

  return (
    <div className="ed-page" style={{ ["--ed-net" as string]: meta.color, ["--ed-net-ink" as string]: meta.ink, paddingBottom: 100 }}>
      <div className="ed-wrap ed-stack" style={{ paddingTop: 22, gap: 22 }}>
        <div className="ed-stack" style={{ gap: 8 }}>
          <h1 className="ed-h1" style={{ fontSize: "clamp(26px,7vw,40px)" }}>Bulk data top-up</h1>
          <p className="ed-muted" style={{ margin: 0 }}>Top up 2 to 50 numbers with one payment. For teams, churches and schools.</p>
        </div>

        <ol className="ed-chips" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Steps">
          {["Choose bundle", "Enter numbers", "Review and pay"].map((s, i) => (
            <li key={s} className={`ed-chip${step === i + 1 ? " on" : ""}`} aria-current={step === i + 1 ? "step" : undefined}>{i + 1}. {s}</li>
          ))}
        </ol>

        {step === 1 && (
          <section className="ed-stack" style={{ gap: 12 }} aria-labelledby="b1">
            <h2 id="b1" className="ed-h2" style={{ fontSize: 20 }}>Which bundle should each number get?</h2>
            <div className="ed-seg" role="tablist" aria-label="Network" style={{ background: "var(--ed-card)" }}>
              {(["mtn", "telecel", "airteltigo"] as BuyNetwork[]).map((n) => (
                <button key={n} type="button" role="tab" aria-selected={network === n} aria-current={network === n} style={network === n ? { background: NETWORK_META[n].color, color: NETWORK_META[n].ink } : { color: "var(--ed-text)" }}
                  onClick={() => { setNetwork(n); setSelectedBundle(null); }}>{NETWORK_META[n].label}</button>
              ))}
            </div>
            {filtered.length === 0 ? <p className="ed-muted">No bundles available.</p> : (
              <div className="ed-grid2">
                {filtered.map((b) => (
                  <button key={b.id} type="button" className={`ed-tile${selectedBundle?.id === b.id ? " sel" : ""}`} aria-pressed={selectedBundle?.id === b.id} onClick={() => setSelectedBundle(b)}>
                    <span className="sz">{b.size}</span>
                    <span className="vd">per number</span>
                    <span className="pr">{money(b.price)}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={`ed-btn tall block ${selectedBundle ? "y" : "dis"}`} disabled={!selectedBundle} onClick={() => setStep(2)}>Continue</button>
          </section>
        )}

        {step === 2 && selectedBundle && (
          <section className="ed-stack" style={{ gap: 14 }} aria-labelledby="b2">
            <h2 id="b2" className="ed-h2" style={{ fontSize: 20 }}>{meta.label} {selectedBundle.size} for each number</h2>
            <div>
              <label style={label} htmlFor="b_phones">Phone numbers, one per line (2 to 50)</label>
              <textarea id="b_phones" value={phonesText} onChange={(e) => setPhonesText(e.target.value)} rows={8} placeholder={"0241234567\n0551234567\n0241234568"} style={{ ...inputStyle, padding: 12, minHeight: 160, fontFamily: "monospace", resize: "vertical" }} />
              <p className="ed-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                {uniquePhones.length > 0 ? <b style={{ color: "var(--ed-green)" }}>{uniquePhones.length} valid number{uniquePhones.length !== 1 ? "s" : ""}</b> : "Paste the numbers, one per line."}
                {invalidCount > 0 && <span style={{ color: "var(--ed-red)", marginLeft: 8 }}>{invalidCount} invalid or repeated removed</span>}
                {uniquePhones.length >= 2 && <span style={{ float: "right", color: "var(--ed-text)", fontWeight: 700 }}>About {money(unitTotal * uniquePhones.length)}</span>}
              </p>
              {network === "mtn" && <p className="ed-chk warn" style={{ marginTop: 8 }}>MTN numbers that are new to our system are delivered by hand within 72 hours. No refund is needed.</p>}
            </div>
            <div><label style={label} htmlFor="b_company">Company or organisation (optional)</label><input id="b_company" style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="For example Sunrise Church" /></div>
            <div><label style={label} htmlFor="b_contact">Your contact number, for the receipt and support</label><input id="b_contact" style={inputStyle} type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="024 123 4567" /></div>
            {error && <p className="ed-chk bad" style={{ margin: 0 }}>{error}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
              <button type="button" className="ed-btn o tall" onClick={() => setStep(1)}>Back</button>
              <button type="button" className={`ed-btn tall ${uniquePhones.length >= 2 && cleanContact ? "y" : "dis"}`} disabled={uniquePhones.length < 2 || !cleanContact} onClick={() => { setError(""); setStep(3); }}>Review order</button>
            </div>
          </section>
        )}

        {step === 3 && selectedBundle && (
          <section className="ed-paper" style={{ borderRadius: 22, padding: 18, display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="b3">
            <h2 id="b3" className="ed-h2" style={{ fontSize: 22, color: "var(--ed-ink)" }}>Review and pay</h2>
            <div className="ed-sum">
              <div className="r"><span>Bundle</span><b>{meta.label} {selectedBundle.size}</b></div>
              <div className="r"><span>Numbers</span><b>{uniquePhones.length}</b></div>
              <div className="r"><span>Price per number</span><b>{money(selectedBundle.price)}</b></div>
              {platformFee > 0 && <div className="r"><span>Processing fee</span><b>{money(platformFee)}</b></div>}
              {companyName && <div className="r"><span>Company</span><b>{companyName}</b></div>}
              <div className="r"><span>Contact</span><b>{spaced(cleanContact ?? contactPhone)}</b></div>
              <div className="r tot"><span>Total</span><b>{money(grandTotal)}</b></div>
            </div>
            <details>
              <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>See the {uniquePhones.length} numbers</summary>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 150, overflowY: "auto", fontFamily: "monospace", fontSize: 12 }}>{uniquePhones.map((p) => <span key={p}>{spaced(p)}</span>)}</div>
            </details>

            <div role="radiogroup" aria-label="Your Mobile Money network">
              <span className="lt">Your Mobile Money network</span>
              <div className="ed-nets3">
                {MOMO_NETWORKS.map((n) => (
                  <button key={n.id} type="button" role="radio" aria-checked={momoNetwork === n.id} className="ed-net3" onClick={() => { setMomoNetwork(n.id); setConfirmNetwork(false); }}><i style={{ background: n.color }} />{n.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="b_momo" className="lt">Your Mobile Money number</label>
              <input id="b_momo" className={`ed-input${wrong ? " warn" : ""}`} type="tel" inputMode="tel" disabled={!momoNetwork} value={momoPhone} onChange={(e) => { setMomoPhone(e.target.value); setConfirmNetwork(false); }} placeholder={momoNetwork ? "024 123 4567" : "Choose your network first"} />
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ed-g500)" }}>This is the number that pays. It can be different from your contact number.</p>
            </div>
            {wrong && detected && momoNetwork && (
              <div className="ed-note warn" role="alert">
                <b>{spaced(momoClean ?? "")} looks like a {labelOf(detected)} number.</b> Choose {labelOf(detected)}, or confirm it is on {labelOf(momoNetwork)}.
                <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, minHeight: 44, fontWeight: 700 }}>
                  <input type="checkbox" checked={confirmNetwork} onChange={(e) => setConfirmNetwork(e.target.checked)} style={{ width: 22, height: 22 }} />This number is on {labelOf(momoNetwork)}
                </label>
              </div>
            )}
            {error && <div className="ed-note bad" role="alert">{error}</div>}
            {lateRef && (
              <PaymentLate
                reference={lateRef}
                onPaid={async (a) => { await finishPaid(a, lateRef, lateBody); }}
                onFailed={() => { setLateRef(null); setError("The payment was declined or cancelled on your phone. Please try again."); }}
              />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
              <button type="button" className="ed-btn o tall" style={{ color: "var(--ed-ink)", borderColor: "var(--ed-g300)" }} onClick={() => setStep(2)}>Back</button>
              <button type="button" className={`ed-btn tall ${canPay ? "b" : "dis paper"}`} disabled={!canPay} onClick={() => void handlePay()}>{loading ? "Waiting for your PIN…" : `Pay ${money(grandTotal)}`}</button>
            </div>
          </section>
        )}

        <Link href="/buy" className="ed-link" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", alignSelf: "center" }}>Need just one number? Buy a single bundle</Link>
      </div>
    </div>
  );
}

export default function BusinessPage() {
  return (
    <Suspense fallback={<div className="ed-page" style={{ display: "grid", placeItems: "center" }}><span className="ed-spin" style={{ width: 32, height: 32, color: "var(--ed-yellow)" }} /></div>}>
      <BusinessContent />
    </Suspense>
  );
}
