"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/ed/Icon";
import { NETWORK_META, parseNetwork } from "@/lib/ed-networks";

interface OrderResult {
  reference: string;
  status: string;
  customer_name?: string;
  phone?: string;
  network?: string;
  bundle_size?: string;
  amount: number;
  created_at: string;
  completed_at?: string | null;
  inventor_status?: string | null;
  inventor_message?: string | null;
}

interface VerifiedOrder {
  reference: string;
  customer_name: string;
  network: string;
  bundle_size: string;
  amount: number;
  phone: string;
}

type StepState = "done" | "now" | "wait" | "bad";

const WHATSAPP = "https://wa.me/233509794503";

function fmtTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function isPhone(val: string) {
  return /^0[2-5]\d{8}$/.test(val.replace(/\s/g, ""));
}
const spaced = (p: string) => p.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");

/** Plain words for each status, and the four receipt steps that go with it. */
function describe(order: OrderResult): { pill: string; tone: "" | "good" | "bad"; note: string; steps: Array<{ title: string; sub: string; state: StepState; time?: string }> } {
  const st = (order.status ?? "").toLowerCase();
  const paid = { title: "Payment received", sub: `GH₵${Number(order.amount).toFixed(2)} by Mobile Money`, state: "done" as StepState, time: fmtTime(order.created_at) };
  switch (st) {
    case "completed":
      return { pill: "Delivered", tone: "good", note: "Your data has been delivered. Thank you for choosing Elite Data.", steps: [paid, { title: "Order checked", sub: "Approved for delivery", state: "done" }, { title: "Data sent", sub: "Sent to the network", state: "done" }, { title: "Delivered", sub: "It is on your phone", state: "done", time: fmtTime(order.completed_at) }] };
    case "processing":
      return { pill: "Sending", tone: "", note: "Most orders arrive in 1 to 3 minutes. You can close this page. We text you when it lands.", steps: [paid, { title: "Order checked", sub: "Approved for delivery", state: "done" }, { title: "Sending your data", sub: "Talking to the network now", state: "now" }, { title: "Delivered", sub: "You get an SMS", state: "wait", time: "soon" }] };
    case "pending_approval":
    case "pending":
      return { pill: "Checking", tone: "", note: "We are checking your order. This usually takes a minute or two.", steps: [paid, { title: "Checking your order", sub: "A quick check before we send", state: "now" }, { title: "Sending your data", sub: "Next", state: "wait" }, { title: "Delivered", sub: "You get an SMS", state: "wait" }] };
    case "not_on_list":
      return { pill: "On its way", tone: "", note: "This number is new to our system, so delivery can take up to 72 hours. No refund is needed. Your data is on the way.", steps: [paid, { title: "Order checked", sub: "Approved for delivery", state: "done" }, { title: "Waiting for the network", sub: "New numbers can take up to 72 hours", state: "now" }, { title: "Delivered", sub: "You get an SMS", state: "wait" }] };
    case "failed":
      return { pill: "Not delivered", tone: "bad", note: "We could not deliver this order. Request your refund below. It is processed within 12 hours.", steps: [paid, { title: "Order checked", sub: "Approved for delivery", state: "done" }, { title: "Delivery failed", sub: "The network could not take it", state: "bad" }, { title: "Refund", sub: "Request it below", state: "wait" }] };
    case "rejected":
      return { pill: "Stopped", tone: "bad", note: "We could not complete this order. Request your refund below. It is processed within 12 hours.", steps: [paid, { title: "Order stopped", sub: "We could not complete it", state: "bad" }, { title: "Refund", sub: "Request it below", state: "wait" }] };
    case "refunded":
      return { pill: "Refunded", tone: "good", note: "Your refund has been sent. Please allow your payment provider a little time to settle it.", steps: [paid, { title: "Refund sent", sub: "Back to your Mobile Money", state: "done" }] };
    default:
      return { pill: st || "Pending", tone: "", note: "Your order has been received.", steps: [paid, { title: "Order checked", sub: "", state: "wait" }, { title: "Delivered", sub: "", state: "wait" }] };
  }
}

function Receipt({ order }: { order: OrderResult }) {
  const net = NETWORK_META[parseNetwork(order.network)];
  const d = describe(order);
  const phone = order.phone ?? "";
  return (
    <div>
      <div className="ed-receipt" aria-live="polite">
        <div className="rt">
          <div className="t"><b>{(order.network ?? "").toUpperCase()} {order.bundle_size}</b>{phone ? `To ${spaced(phone)}` : ""}</div>
          <span className={`ed-pill${d.tone ? ` ${d.tone}` : ""}`}>{d.pill}</span>
        </div>
        <hr />
        <div className="ed-steps">
          {d.steps.map((s, i) => (
            <div key={i} className={`ed-step ${s.state}`}>
              <span className="dot">{s.state === "done" ? <Icon name="check" small /> : s.state === "bad" ? <Icon name="x" small /> : null}</span>
              <div className="tx"><b>{s.title}</b>{s.sub}</div>
              <span className="tm">{s.time ?? ""}</span>
            </div>
          ))}
        </div>
        <hr />
        <div className="ed-sum" style={{ border: 0, background: "transparent", padding: 0 }}>
          <div className="r"><span>Reference</span><b style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{order.reference}</b></div>
          <div className="r"><span>Placed</span><b>{fmtDate(order.created_at)}</b></div>
          <div className="r tot"><span>Amount</span><b>GH₵{Number(order.amount).toFixed(2)}</b></div>
        </div>
      </div>
      <p className="ed-muted" style={{ margin: "14px 2px 0", fontSize: 13, lineHeight: 1.5 }}>{d.note}</p>
      <span style={{ display: "none" }}>{net.label}</span>
    </div>
  );
}

function TrackContent() {
  const params = useSearchParams();
  const initialRef = params.get("ref") ?? "";

  const [query, setQuery] = useState(initialRef);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [orders, setOrders] = useState<OrderResult[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Refund request
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundStep, setRefundStep] = useState<1 | 2 | 3>(1);
  const [verRef, setVerRef] = useState("");
  const [verPhone, setVerPhone] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verError, setVerError] = useState("");
  const [verifiedOrder, setVerifiedOrder] = useState<VerifiedOrder | null>(null);
  const [momoName, setMomoName] = useState("");
  const [momoPhone, setMomoPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [multipleOrders, setMultipleOrders] = useState<VerifiedOrder[]>([]);
  const [copied, setCopied] = useState(false);

  function openRefund(prefillRef?: string, prefillPhone?: string) {
    setVerRef(prefillRef ?? "");
    setVerPhone(prefillPhone ?? "");
    setVerifiedOrder(null);
    setVerError("");
    setMomoName("");
    setMomoPhone("");
    setSubmitError("");
    setMultipleOrders([]);
    setRefundStep(1);
    setRefundOpen(true);
  }

  async function handleVerify(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setVerifying(true);
    setVerError("");
    setMultipleOrders([]);
    try {
      const res = await fetch("/api/orders/verify-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: verRef.trim(), phone: verPhone.trim() }),
      });
      const data = await res.json();
      if (data.success && data.order) { setVerifiedOrder(data.order); setRefundStep(2); }
      else if (data.success && data.multiple) setMultipleOrders(data.multiple);
      else setVerError(data.error ?? "We could not verify that. Check your phone number and try again.");
    } catch {
      setVerError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRefundSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/orders/manual-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: verifiedOrder?.reference ?? verRef.trim(),
          customerPhone: verifiedOrder?.phone,
          customerName: verifiedOrder?.customer_name,
          network: verifiedOrder?.network,
          bundleSize: verifiedOrder?.bundle_size,
          refundName: momoName.trim(),
          refundPhone: momoPhone.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) setRefundStep(3);
      else setSubmitError("We could not send the request. Please try again.");
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const searchByRef = useCallback(async (ref: string, silent = false) => {
    const trimmed = ref.trim();
    if (!trimmed) return;
    if (!silent) { setLoading(true); setOrder(null); setOrders(null); setNotFound(false); }
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && data.order) { setOrder(data.order); setNotFound(false); }
      else if (!silent) setNotFound(true);
    } catch { if (!silent) setNotFound(true); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const searchByPhone = useCallback(async (phone: string) => {
    const cleaned = phone.replace(/\s/g, "");
    setLoading(true); setOrder(null); setOrders(null); setNotFound(false);
    try {
      const res = await fetch(`/api/orders/by-phone?phone=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (data.success && data.orders?.length > 0) { setOrders(data.orders); setNotFound(false); }
      else setNotFound(true);
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initialRef) { const t = setTimeout(() => void searchByRef(initialRef), 0); return () => clearTimeout(t); }
  }, [initialRef, searchByRef]);

  // Refresh every 15 seconds while the order is still moving, and only while the tab is visible.
  useEffect(() => {
    const status = order?.status?.toLowerCase();
    if (status !== "processing" && status !== "pending" && status !== "pending_approval") return;
    const id = setInterval(() => {
      if (document.hidden) return;
      void searchByRef(order!.reference, true);
    }, 15_000);
    return () => clearInterval(id);
  }, [order, searchByRef]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const val = query.trim();
    if (!val) return;
    if (isPhone(val)) await searchByPhone(val);
    else await searchByRef(val);
  }

  const statusKey = order?.status?.toLowerCase() ?? "";
  const canRefund = statusKey === "failed" || statusKey === "rejected";

  async function shareLink() {
    if (!order) return;
    const url = `${window.location.origin}/track?ref=${encodeURIComponent(order.reference)}`;
    try {
      if (navigator.share) { await navigator.share({ title: "Elite Data order", url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled */ }
  }

  return (
    <div className="ed-page" style={{ paddingBottom: 120 }}>
      <div className="ed-appbar">
        <Link href="/" className="ed-ibtn plain" aria-label="Back to home"><Icon name="back" /></Link>
        <h1 className="ed-appbar-title" style={{ margin: 0 }}>Track order</h1>
      </div>

      <div className="ed-wrap ed-stack" style={{ paddingTop: 18, gap: 18 }}>
        <form onSubmit={handleSubmit} className="ed-stack" style={{ gap: 10 }}>
          <label htmlFor="track-query" className="ed-muted" style={{ fontSize: 12, fontWeight: 700 }}>Order reference or phone number</label>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="ed-nin" style={{ flex: 1, minHeight: 56 }}>
              <input id="track-query" type="text" inputMode="text" autoCapitalize="characters" placeholder="YBK-123456 or 024 123 4567" value={query}
                onChange={(e) => { setQuery(e.target.value); setOrder(null); setOrders(null); setNotFound(false); }} style={{ fontSize: 17 }} />
            </div>
            <button type="submit" className="ed-btn y" style={{ minHeight: 56, minWidth: 84 }} disabled={loading}>{loading ? "…" : "Find"}</button>
          </div>
          <p className="ed-muted" style={{ margin: 0, fontSize: 12 }}>Use the reference from your payment receipt, or your phone number to see all your orders.</p>
        </form>

        {orders && (
          <div>
            <p className="ed-muted" style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>{orders.length} order{orders.length !== 1 ? "s" : ""} found for {query}</p>
            {orders.map((o) => {
              const d = describe(o);
              return (
                <button key={o.reference} type="button" className="ed-lrow" style={{ width: "100%", background: "transparent", border: 0, borderBottom: "1px solid var(--ed-line)", color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit" }}
                  onClick={() => { setQuery(o.reference); void searchByRef(o.reference); setOrders(null); }}>
                  <span className="z" style={{ fontSize: 22, width: 72 }}>{o.bundle_size}</span>
                  <span className="t"><b>{(o.network ?? "").toUpperCase()}</b>{fmtDate(o.created_at)}</span>
                  <span style={{ textAlign: "right" }}>
                    <span className="p" style={{ display: "block", fontSize: 16 }}>GH₵{Number(o.amount).toFixed(2)}</span>
                    <span className={`ed-pill${d.tone ? ` ${d.tone}` : ""}`} style={{ fontSize: 10 }}>{d.pill}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {order && (
          <>
            <Receipt order={order} />
            <div className="ed-grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <a href={`${WHATSAPP}?text=${encodeURIComponent(`Hi Elite Data support, my order reference is ${order.reference}. Please assist me with delivery status.`)}`} target="_blank" rel="noopener noreferrer" className="ed-btn o"><Icon name="whatsapp" small />WhatsApp</a>
              <button type="button" className="ed-btn o" onClick={() => void shareLink()}><Icon name="copy" small />{copied ? "Link copied" : "Share link"}</button>
            </div>
            {order.network && (
              <Link href={`/buy/number?network=${parseNetwork(order.network)}`} className="ed-btn y tall block">Buy again</Link>
            )}
            {canRefund && (
              <div className="ed-block">
                <b>Refund available</b>
                <p>Your payment of GH₵{Number(order.amount).toFixed(2)} was taken but the data did not arrive. Request your refund below. It is processed within 12 hours.</p>
                <button type="button" className="ed-btn r" onClick={() => openRefund(order.reference, order.phone ?? "")}>Request my refund</button>
              </div>
            )}
          </>
        )}

        {notFound && (
          <div className="ed-block">
            <b>Not found</b>
            <p>We found no order for <strong>{query}</strong>. Check the reference or number and try again.</p>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="ed-btn o"><Icon name="whatsapp" small />Ask us on WhatsApp</a>
          </div>
        )}

        {!order && !orders && !notFound && (
          <div className="ed-chk warn" style={{ alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>Did not get your data? You can ask for a refund.</span>
            <button type="button" className="ed-btn r" style={{ minHeight: 44, whiteSpace: "nowrap" }} onClick={() => openRefund()}>Request refund</button>
          </div>
        )}

        <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="ed-link" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "center" }}>
          <Icon name="whatsapp" small />Need help? Chat with us on WhatsApp
        </a>
      </div>

      {refundOpen && (
        <div className="ed-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRefundOpen(false); }}>
          <div className="ed-sheet" role="dialog" aria-modal="true" aria-label="Request a refund">
            <div className="ed-grab" />
            {refundStep === 1 && (
              <>
                <div className="ad-sheet-title"><b>Request a refund</b><button type="button" className="ad-x" style={{ color: "var(--ed-g500)" }} onClick={() => setRefundOpen(false)} aria-label="Close"><Icon name="x" /></button></div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--ed-g500)" }}>Step 1 of 2. Enter the phone number the data was sent to. Add the reference too if you have it.</p>
                <form onSubmit={handleVerify} className="ed-stack" style={{ gap: 12 }}>
                  <div><label htmlFor="ver_phone" className="lt">Phone number the data went to</label><input id="ver_phone" className="ed-input" type="tel" inputMode="tel" placeholder="024 123 4567" value={verPhone} onChange={(e) => setVerPhone(e.target.value)} required /></div>
                  <div><label htmlFor="ver_ref" className="lt">Order reference (optional)</label><input id="ver_ref" className="ed-input" style={{ fontSize: 15 }} type="text" placeholder="YBK-123456" value={verRef} onChange={(e) => setVerRef(e.target.value)} autoCapitalize="characters" /></div>
                  {verError && <div className="ed-note bad" role="alert">{verError}</div>}
                  {multipleOrders.length > 0 ? (
                    <div className="ed-stack" style={{ gap: 8 }}>
                      <div className="ed-note warn">We found {multipleOrders.length} failed orders for this number. Pick the one you want refunded.</div>
                      {multipleOrders.map((o) => (
                        <button key={o.reference} type="button" className="ed-btn o" style={{ color: "var(--ed-ink)", borderColor: "var(--ed-g200)", flexDirection: "column", alignItems: "flex-start", padding: "10px 14px", textAlign: "left" }} onClick={() => { setVerifiedOrder(o); setRefundStep(2); }}>
                          <span>{(o.network ?? "").toUpperCase()} {o.bundle_size}, GH₵{Number(o.amount).toFixed(2)}</span>
                          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ed-g500)" }}>Ref {o.reference}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button type="submit" className="ed-btn b tall block" disabled={verifying}>{verifying ? "Checking…" : "Find my order"}</button>
                  )}
                </form>
              </>
            )}

            {refundStep === 2 && verifiedOrder && (
              <>
                <div className="ad-sheet-title"><b>Where to send the money</b><button type="button" className="ad-x" style={{ color: "var(--ed-g500)" }} onClick={() => setRefundOpen(false)} aria-label="Close"><Icon name="x" /></button></div>
                <div className="ed-note ok"><b>Order found.</b> {(verifiedOrder.network ?? "").toUpperCase()} {verifiedOrder.bundle_size}. Refund of <b>GH₵{Number(verifiedOrder.amount).toFixed(2)}</b>.</div>
                <form onSubmit={handleRefundSubmit} className="ed-stack" style={{ gap: 12 }}>
                  <div><label htmlFor="momo_name" className="lt">Name on your Mobile Money account</label><input id="momo_name" className="ed-input" style={{ fontSize: 16 }} type="text" placeholder="Kwame Mensah" value={momoName} onChange={(e) => setMomoName(e.target.value)} required /></div>
                  <div><label htmlFor="momo_num" className="lt">Mobile Money number for the refund</label><input id="momo_num" className="ed-input" type="tel" inputMode="tel" placeholder="024 123 4567" value={momoPhone} onChange={(e) => setMomoPhone(e.target.value)} required /></div>
                  {submitError && <div className="ed-note bad" role="alert">{submitError}</div>}
                  <button type="submit" className="ed-btn b tall block" disabled={submitting}>{submitting ? "Sending…" : "Send refund request"}</button>
                </form>
              </>
            )}

            {refundStep === 3 && (
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "grid", placeItems: "center", margin: "0 auto" }}><Icon name="check" /></div>
                <h2 className="ed-h2" style={{ fontSize: 24 }}>Refund request sent</h2>
                <p style={{ margin: 0, fontSize: 14, color: "var(--ed-g500)" }}>We will send your refund within 12 hours. If it has not arrived by then, please contact our help line.</p>
                <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="ed-btn o" style={{ color: "var(--ed-ink)", borderColor: "var(--ed-g200)" }}>Contact the help line</a>
                <button type="button" className="ed-btn b block" onClick={() => setRefundOpen(false)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="ed-page" style={{ display: "grid", placeItems: "center" }}><span className="ed-spin" style={{ width: 32, height: 32, color: "var(--ed-yellow)" }} /></div>}>
      <TrackContent />
    </Suspense>
  );
}
