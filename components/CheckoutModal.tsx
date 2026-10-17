"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bundle, networkConfig } from "@/lib/bundles";
import { normalizeGhPhone, detectGhProvider } from "@/lib/phone";
import { ALTERNATE_STORE_LABEL, ALTERNATE_STORE_URL, DEFAULT_CLOSED_MESSAGE } from "@/lib/store-closed";
import { MOMO_NETWORKS, type MomoNetwork } from "@/lib/ed-networks";
import { spacedPhone } from "@/lib/client/order-draft";
import Icon from "@/components/ed/Icon";

/**
 * The Pay step.
 *
 * Mobile Money is the only way to pay. The customer chooses their own Mobile Money
 * network and types their own Mobile Money number. Nothing is filled in for them:
 * the person paying is often not the person receiving the data.
 */

interface Props {
  bundle: Bundle;
  /** The number the data goes to, already checked on the number step. */
  recipient: string;
  /** True when the number step accepted `recipient`. */
  verified: boolean;
  referralVia?: string;
  /** Where "Change" on the data number goes. */
  changeNumberHref: string;
  onClose: () => void;
}

const PLATFORM_FEE_RATE = 0.02;

type LoyaltyData = {
  count: number;
  total: number;
  windowEndsAt: string | null;
  rewardEarned: boolean;
};

type SuccessState = { reference: string; loyalty?: LoyaltyData };
type FailedState = { reference: string; network: string; bundleSize: string };
type PendingApprovalState = { reference: string };
type NumberBlock = { message: string; verifyUrl: string | null };

// ── Saved numbers (this phone only) ─────────────────────────────────────────
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
    setList((prev) => {
      const next = [{ label: label.trim() || cleaned, phone: cleaned }, ...prev.filter((b) => b.phone !== cleaned)].slice(0, 10);
      try { localStorage.setItem(BEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  return { list, save };
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

const money = (n: number) => `GH₵${n.toFixed(2)}`;

export default function CheckoutModal({ bundle, recipient, verified, referralVia, changeNumberHref, onClose }: Props) {
  const phone = recipient;
  const [name] = useState("Customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [fraudTrap, setFraudTrap] = useState(false);
  const [failedOrder, setFailedOrder] = useState<FailedState | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalState | null>(null);
  const [refundName, setRefundName] = useState("");
  const [refundPhone, setRefundPhone] = useState("");
  const [refundSending, setRefundSending] = useState(false);
  const [refundSubmitted, setRefundSubmitted] = useState(false);
  const [referralCredit, setReferralCredit] = useState(0);
  const [copied, setCopied] = useState(false);
  const [surcharge, setSurcharge] = useState(0);
  const [saveLabel, setSaveLabel] = useState("");
  const [beneficiarySaved, setBeneficiarySaved] = useState(false);
  const [momoPhone, setMomoPhone] = useState("");
  const [momoNetwork, setMomoNetwork] = useState<MomoNetwork | null>(null);
  const [confirmNetwork, setConfirmNetwork] = useState(false);
  const [momoPending, setMomoPending] = useState(false);
  const [momoMessage, setMomoMessage] = useState("");
  const [numberBlock, setNumberBlock] = useState<NumberBlock | null>(null);
  const [telecelNoticeEnabled, setTelecelNoticeEnabled] = useState(false);
  // Set when the admin has closed the store after this page was loaded.
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  const { list: beneficiaries, save: saveBeneficiary } = useBeneficiaries();
  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pollStopRef.current) { clearTimeout(pollStopRef.current); pollStopRef.current = null; }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  // Admin-controlled: when on, Telecel Mobile Money customers are told to
  // WhatsApp the admin and send the money to the admin instead of paying here.
  const telecelBlocked = telecelNoticeEnabled && momoNetwork === "telecel";
  useEffect(() => {
    fetch("/api/admin/store-status")
      .then((r) => r.json())
      .then((d) => {
        setTelecelNoticeEnabled(d.telecelNoticeEnabled === true);
        setClosedNotice(d.open === false ? (String(d.closedMessage ?? "").trim() || DEFAULT_CLOSED_MESSAGE) : null);
      })
      .catch(() => {});
  }, []);

  const net = networkConfig[bundle.network];
  const feeAmount = parseFloat((bundle.price * PLATFORM_FEE_RATE).toFixed(2));
  const baseTotal = parseFloat((bundle.price + feeAmount).toFixed(2));
  const totalAmount = parseFloat(Math.max(baseTotal - referralCredit + surcharge, 0).toFixed(2));

  // Referral credit and any pending surcharge belong to the number that gets the data.
  useEffect(() => {
    const cleaned = phone.replace(/\s/g, "");
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    phoneCheckTimer.current = setTimeout(() => {
      if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setReferralCredit(0); setSurcharge(0); return; }
      Promise.all([
        fetch(`/api/referral/check?phone=${encodeURIComponent(cleaned)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/orders/pending-surcharge?phone=${encodeURIComponent(cleaned)}`).then((r) => r.json()).catch(() => ({ surcharge: 0 })),
      ]).then(([data, sc]) => {
        setReferralCredit(data.credits ?? 0);
        setSurcharge(sc.surcharge ?? 0);
      });
    }, 400);
    return () => { if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current); };
  }, [phone]);

  // What the customer typed, and what that number's prefix says about its network.
  const momoClean = normalizeGhPhone(momoPhone);
  const detected = momoClean ? detectGhProvider(momoClean) : null;
  const networkLooksWrong = !!(momoNetwork && detected && detected !== momoNetwork);
  const networkLabel = (id: MomoNetwork | null) => MOMO_NETWORKS.find((n) => n.id === id)?.label ?? "";

  const canPay =
    !loading &&
    !!momoNetwork &&
    !!momoClean &&
    (!networkLooksWrong || confirmNetwork) &&
    !telecelBlocked &&
    !closedNotice &&
    !!phone;

  async function completePaidOrder(reference: string) {
    const autoEmail = `${phone.replace(/\s/g, "")}@elitedata1.com`;
    const customerName = phone.trim();
    const response = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: customerName,
        email: autoEmail,
        phone,
        bundleId: bundle.id,
        paymentRef: reference,
        referralVia: referralVia ?? null,
        applyReferralCredit: referralCredit > 0,
        fastDelivery: false,
        promoCode: null,
        promoDiscount: null,
        surcharge: surcharge > 0 ? surcharge : null,
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!data.success) {
      setError(data.error || "Something went wrong. Please contact support.");
      return;
    }
    if (data.fraudTrap) { setFraudTrap(true); return; }
    if (data.pendingApproval) setPendingApproval({ reference: data.reference });
    else if (data.failed) setFailedOrder({ reference: data.reference, network: data.network, bundleSize: data.bundleSize });
    else setSuccess({ reference: data.reference, loyalty: data.loyalty });
  }

  async function handlePay() {
    setError("");
    setNumberBlock(null);
    if (!canPay || !momoNetwork || !momoClean) return;

    setLoading(true);

    // Is the data number blocked? Checked before anything else.
    try {
      const br = await fetch("/api/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\s/g, "") }),
      });
      const bd = (await br.json()) as { blocked: boolean };
      if (bd.blocked) {
        setLoading(false);
        setError("This number cannot be used for orders. Please contact support.");
        return;
      }
    } catch {
      // Network error: the server checks again.
    }

    setMomoPending(true);
    setMomoMessage("Sending the payment request to your phone…");

    try {
      const res = await fetch("/api/yebeck/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalAmount,
          phone: momoClean,
          network: momoNetwork,
          confirmNetwork: networkLooksWrong && confirmNetwork,
          type: "data_order",
          name: phone,
          metadata: {
            customer_name: phone,
            bundle_id: bundle.id,
            recipient_phone: phone,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoading(false);
        setMomoPending(false);
        if (data.code === "number_not_verified") {
          setNumberBlock({ message: data.message, verifyUrl: data.verifyUrl ?? null });
        } else {
          setError(data.message || "We could not start the Mobile Money prompt. Please try again.");
        }
        return;
      }

      const ref = data.reference as string;
      setMomoMessage(data.message || "Prompt sent. Approve it on your phone.");

      // Check every 1.8 seconds, for up to 3 minutes.
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/yebeck/status?reference=${encodeURIComponent(ref)}`);
          const statusData = await statusRes.json();
          if (statusData.status === "success") {
            stopPolling();
            setMomoPending(false);
            setMomoMessage("Payment approved. Creating your order…");
            await completePaidOrder(ref);
          } else if (statusData.status === "failed") {
            stopPolling();
            setLoading(false);
            setMomoPending(false);
            setError("The payment was declined or cancelled on your phone. Please try again.");
          } else {
            setMomoMessage("Waiting for your approval. Check the prompt on your phone.");
          }
        } catch {
          // keep polling
        }
      }, 1800);
      pollStopRef.current = setTimeout(() => {
        stopPolling();
        setLoading(false);
        setMomoPending(false);
        setError("The payment timed out. If you already approved it, track your order or contact support.");
      }, 180000);
    } catch {
      setLoading(false);
      setMomoPending(false);
      setError("We could not start the Mobile Money request. Check your connection and try again.");
    }
  }

  if (fraudTrap) {
    return (
      <div className="ed-overlay" style={{ alignItems: "center", background: "rgba(0,0,0,.85)" }}>
        <div className="ed-sheet dk" style={{ borderRadius: 20, textAlign: "center", padding: 28 }}>
          <h2 className="ed-h2" style={{ color: "var(--ed-red)" }}>This order was stopped</h2>
          <p className="ed-muted" style={{ margin: 0 }}>Your order was flagged. Please contact support if you think this is a mistake.</p>
        </div>
      </div>
    );
  }

  if (failedOrder) {
    const shortRef = failedOrder.reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
    return (
      <div className="ed-overlay">
        <div className="ed-sheet">
          <div className="ed-grab" />
          <h2 className="ed-h2" style={{ fontSize: 24 }}>We could not deliver your order</h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ed-g500)" }}>
            We could not deliver your {failedOrder.network.toUpperCase()} {failedOrder.bundleSize}. Enter your Mobile Money details below and we will refund you.
          </p>
          <div className="ed-note bad"><b>Order reference</b><br /><span className="ed-num">{shortRef}</span></div>
          {!refundSubmitted ? (
            <>
              <div>
                <label htmlFor="refund_name" className="lt">Name on your Mobile Money account</label>
                <input id="refund_name" className="ed-input" style={{ fontSize: 16 }} type="text" value={refundName} onChange={(e) => setRefundName(e.target.value)} placeholder="Your full name" />
              </div>
              <div>
                <label htmlFor="refund_phone" className="lt">Mobile Money number for the refund</label>
                <input id="refund_phone" className="ed-input" type="tel" inputMode="tel" value={refundPhone} onChange={(e) => setRefundPhone(e.target.value)} placeholder="024 123 4567" />
              </div>
              <button
                type="button"
                className={`ed-btn tall block b${refundSending || !refundName.trim() || !refundPhone.trim() ? " dis paper" : ""}`}
                disabled={refundSending || !refundName.trim() || !refundPhone.trim()}
                onClick={async () => {
                  setRefundSending(true);
                  await fetch("/api/orders/manual-request", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      reference: failedOrder.reference,
                      customerPhone: phone,
                      customerName: name,
                      network: failedOrder.network,
                      bundleSize: failedOrder.bundleSize,
                      refundName: refundName.trim(),
                      refundPhone: refundPhone.trim(),
                    }),
                  }).catch(() => {});
                  setRefundSending(false);
                  setRefundSubmitted(true);
                }}
              >
                {refundSending ? "Sending…" : "Request my refund"}
              </button>
            </>
          ) : (
            <div className="ed-note ok"><b>Refund request received.</b><br />Your refund will be processed within 12 hours. If it does not arrive, please contact our help line.</div>
          )}
          <button type="button" className="ed-btn o block" style={{ color: "var(--ed-g500)", borderColor: "var(--ed-g200)" }} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (pendingApproval || success) {
    const reference = (pendingApproval ?? success)!.reference;
    const loyalty = success?.loyalty;
    const referralLink = typeof window !== "undefined" ? `${window.location.origin}/buy?via=${phone.replace(/\s/g, "")}` : "";
    return (
      <div className="ed-overlay">
        <div className="ed-sheet">
          <div className="ed-grab" />
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "grid", placeItems: "center", margin: "4px auto 10px" }}><Icon name="check" /></div>
            <h2 className="ed-h2" style={{ fontSize: 26 }}>{pendingApproval ? "Order placed" : "Payment confirmed"}</h2>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ed-g500)" }}>
              Your <b>{net.name} {bundle.size}</b> bundle is on its way to <b className="ed-num">{spacedPhone(phone)}</b>. You will get an SMS when it lands.
            </p>
          </div>

          <div className="ed-receipt" style={{ background: "var(--ed-g50)", border: "1px solid var(--ed-g200)", borderRadius: 14, WebkitMask: "none", mask: "none", padding: 14, gap: 8 }}>
            <div className="rt"><div className="t"><b style={{ fontSize: 16 }}>Payment receipt</b></div><span className="ed-pill good">Paid</span></div>
            <hr />
            <div className="ed-sum" style={{ border: 0, background: "transparent", padding: 0 }}>
              <div className="r"><span>Order reference</span><b style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{reference}</b></div>
              <div className="r"><span>Data goes to</span><b>{spacedPhone(phone)}</b></div>
              <div className="r"><span>Bundle</span><b>{net.name} {bundle.size}</b></div>
              <div className="r"><span>Paid with</span><b>Mobile Money</b></div>
              <div className="r tot"><span>Amount paid</span><b>{money(totalAmount)}</b></div>
            </div>
          </div>

          {!beneficiarySaved && !beneficiaries.some((b) => b.phone === phone.replace(/\s/g, "") && b.label !== b.phone) && (
            <div className="ed-note">
              <b>Save this number?</b> Save {spacedPhone(phone)} so you can pick it quickly next time.
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input aria-label="Name for this number" type="text" placeholder="Name, for example Mum" value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} maxLength={20} className="ed-input" style={{ fontSize: 14, minHeight: 44 }} />
                <button type="button" className="ed-btn b" style={{ minHeight: 44 }} onClick={() => { saveBeneficiary(phone, saveLabel || phone.replace(/\s/g, "")); setBeneficiarySaved(true); }}>Save</button>
              </div>
            </div>
          )}
          {beneficiarySaved && <div className="ed-note ok">Number saved. You can pick it next time.</div>}

          {loyalty && (loyalty.rewardEarned ? (
            <div className="ed-note ok"><b>Free 1GB earned.</b> You bought 4 bundles today, so a free 1GB {net.name} bundle is being delivered to your phone.</div>
          ) : loyalty.count > 0 && loyalty.windowEndsAt ? (
            <div className="ed-note warn">
              <b>Loyalty card:</b> {loyalty.count} of {loyalty.total} bundles. {loyalty.total - loyalty.count} more in {timeLeft(loyalty.windowEndsAt)} earns a free 1GB.
            </div>
          ) : null)}

          {referralLink && (
            <div className="ed-note">
              <b>Refer and earn GH₵1.</b> Share your link. You get GH₵1 off your next purchase for every friend who buys.
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{referralLink}</span>
                <button type="button" className="ed-btn b" style={{ minHeight: 40, fontSize: 13 }} onClick={() => copyToClipboard(referralLink, () => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>{copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
          )}

          <a href={`/track?ref=${encodeURIComponent(reference)}`} className="ed-btn tall block y">Track my order</a>
          <button type="button" className="ed-btn o block" style={{ color: "var(--ed-g500)", borderColor: "var(--ed-g200)" }} onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ed-paper" style={{ minHeight: "100vh", paddingBottom: 130 }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left))", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ed-sum">
          <div className="r"><span>Bundle</span><b>{net.name} {bundle.size}, {bundle.validity || "never expires"}</b></div>
          <div className="r">
            <span>Data goes to</span>
            <b>
              {spacedPhone(phone)}
              {verified && <span className="ok2">Verified</span>}
              {" "}<Link href={changeNumberHref} style={{ color: "var(--ed-blue)", fontWeight: 800, fontSize: 12, marginLeft: 6 }}>Change</Link>
            </b>
          </div>
          <div className="r"><span>Bundle price</span><b>{money(bundle.price)}</b></div>
          <div className="r"><span>Processing fee (2%)</span><b>{money(feeAmount)}</b></div>
          {referralCredit > 0 && <div className="r"><span>Referral credit</span><b>-{money(referralCredit)}</b></div>}
          {surcharge > 0 && <div className="r"><span>Pending surcharge</span><b>{money(surcharge)}</b></div>}
          <div className="r tot"><span>Total</span><b>{money(totalAmount)}</b></div>
        </div>

        <div role="radiogroup" aria-label="Your Mobile Money network">
          <span className="lt">Your Mobile Money network</span>
          <div className="ed-nets3">
            {MOMO_NETWORKS.map((n) => (
              <button key={n.id} type="button" role="radio" aria-checked={momoNetwork === n.id} className="ed-net3" onClick={() => { setMomoNetwork(n.id); setConfirmNetwork(false); }}>
                <i style={{ background: n.color }} />{n.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="momo_phone" className="lt">Your Mobile Money number</label>
          <input
            id="momo_phone"
            className={`ed-input${networkLooksWrong ? " warn" : ""}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={!momoNetwork}
            value={momoPhone}
            onChange={(e) => { setMomoPhone(e.target.value); setConfirmNetwork(false); }}
            placeholder={momoNetwork ? "024 123 4567" : "Choose your network first"}
          />
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ed-g500)" }}>
            This is the number that pays. It can be a different number from the one getting the data.
          </p>
        </div>

        {networkLooksWrong && detected && momoNetwork && (
          <div className="ed-note warn" role="alert">
            <b>{spacedPhone(momoClean ?? "")} looks like a {networkLabel(detected)} number.</b> Choose {networkLabel(detected)}, or confirm that this number is on {networkLabel(momoNetwork)}.
            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, minHeight: 44, fontWeight: 700 }}>
              <input type="checkbox" checked={confirmNetwork} onChange={(e) => setConfirmNetwork(e.target.checked)} style={{ width: 22, height: 22 }} />
              This number is on {networkLabel(momoNetwork)}
            </label>
          </div>
        )}

        {momoNetwork && momoClean && (!networkLooksWrong || confirmNetwork) && (
          <div className="ed-note">The payment prompt goes to <b>{spacedPhone(momoClean)}</b>. The data goes to <b>{spacedPhone(phone)}</b>.</div>
        )}

        {closedNotice && (
          <div className="ed-note warn">
            <b>We are temporarily closed.</b>
            <p style={{ margin: "6px 0", whiteSpace: "pre-line" }}>{closedNotice}</p>
            <a href={ALTERNATE_STORE_URL} className="ed-btn b block">Buy data at {ALTERNATE_STORE_LABEL}</a>
          </div>
        )}

        {telecelBlocked && (
          <div className="ed-note warn">
            <b>Telecel payment: contact the admin.</b>
            <p style={{ margin: "6px 0" }}>Please contact the admin on WhatsApp <b>0509794503</b> (WhatsApp only, no calls) and send the money to the admin.</p>
            <a href="https://wa.me/233509794503" target="_blank" rel="noopener noreferrer" className="ed-btn g block">Chat on WhatsApp</a>
          </div>
        )}

        {numberBlock && (
          <div className="ed-note bad" role="alert">
            <b>New number. Not verified yet.</b>
            <p style={{ margin: "6px 0" }}>{numberBlock.message}</p>
            {numberBlock.verifyUrl && (
              <a className="ed-btn y block" href={numberBlock.verifyUrl} target="_blank" rel="noopener noreferrer">Submit number to be verified <Icon name="ext" small /></a>
            )}
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>No money has been taken.</p>
          </div>
        )}

        {error && <div className="ed-note bad" role="alert">{error}</div>}

        {momoPending && (
          <div className="ed-note warn" aria-live="polite">
            <b>{momoMessage || "Waiting for your approval on your phone…"}</b>
            <p style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
              Did not see the prompt? Approve it by hand:<br />
              MTN MoMo: dial <b>*170#</b>, then My Wallet, then Approvals.<br />
              Telecel Cash: dial <b>*110#</b>, then Pending Approvals.<br />
              AirtelTigo Money: dial <b>*110#</b>.
            </p>
          </div>
        )}
      </div>

      <div className="ed-paperbar">
        <div className="in">
          <button type="button" className={`ed-btn tall block ${canPay ? "b" : "dis paper"}`} disabled={!canPay} onClick={() => void handlePay()}>
            {loading ? (momoPending ? "Waiting for your PIN…" : "Working…") : `Pay ${money(totalAmount)}`}
          </button>
          <p style={{ margin: "8px 0 0", textAlign: "center", fontSize: 12, color: "var(--ed-g500)" }}>
            Pay with Mobile Money. Delivery starts once your payment is approved.
          </p>
        </div>
      </div>
    </div>
  );
}
