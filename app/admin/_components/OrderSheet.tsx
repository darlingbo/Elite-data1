"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/ed/Icon";
import HoldButton from "./ui/HoldButton";
import type { Order } from "./shared/types";
import { NETWORK_META, parseNetwork } from "@/lib/ed-networks";
import { getOrderReviewSecondsRemaining } from "@/lib/order-review-window";
import {
  REJECT_REASONS,
  SMS_TEMPLATES,
  rejectionSms,
  smsParts,
  smsTemplate,
  type RejectReasonId,
  type SmsTemplateId,
} from "@/lib/admin-sms-templates";

/**
 * One order, with every action the admin has for it.
 *
 * Buttons only show when they make sense for the order's status, and money or
 * delete actions need a one-second press and hold. Same rules as the old order
 * list (review window, refund locks, 72h new-number window), in one place.
 */

type View = "detail" | "reject" | "refund" | "sms";

interface Detail {
  order: { reference: string; status: string; amount: number; phone: string; network: string; bundle_size: string; customer_name: string; created_at: string; refunded: boolean; refund_phone: string | null };
  payment: { kind: "momo" | "card" | "wallet"; payerPhone: string | null; payerNetwork: string | null };
  customer: { total: number; today: number; refunds: number; failed: number };
  notes: string[];
  timeline: Array<{ at: string; text: string }>;
}

const NOT_ON_LIST_WINDOW_HOURS = 72;
const money = (n: number) => `GH₵${n.toFixed(2)}`;
const spaced = (p: string) => p.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
const waNumber = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("0") ? `233${d.slice(1)}` : d; };

async function api(url: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && data.error === undefined) data.error = `Request failed (${res.status})`;
  return data;
}

export default function OrderSheet({
  order,
  onClose,
  onChanged,
  onHandled,
  startView = "detail",
}: {
  order: Order;
  onClose: () => void;
  onChanged: () => void;
  onHandled?: (reference: string) => void;
  startView?: View;
}) {
  const [view, setView] = useState<View>(startView);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState(order.status);
  const [refunded, setRefunded] = useState(!!order.refunded);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<"processing" | "complete" | null>(null);

  // reject
  const [reason, setReason] = useState<RejectReasonId>("network_down");
  const [textCustomer, setTextCustomer] = useState(true);
  const [refundNow, setRefundNow] = useState(true);
  // refund
  // sms
  const [smsId, setSmsId] = useState<SmsTemplateId | null>("refunded");
  const [smsText, setSmsText] = useState("");

  const ref = order.reference;
  const statusLower = (status ?? "").toLowerCase();
  const net = NETWORK_META[parseNetwork(order.network)];
  const label = `${(order.network ?? "").toUpperCase()} ${order.bundle_size ?? ""}`.trim();
  const amount = Number(order.amount);

  useEffect(() => {
    let alive = true;
    api(`/api/admin/orders/detail?reference=${encodeURIComponent(ref)}`, "GET").then((d) => {
      if (alive && d.order) setDetail(d as unknown as Detail);
    }).catch(() => {});
    return () => { alive = false; };
  }, [ref]);

  useEffect(() => {
    if (statusLower !== "pending_approval") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [statusLower]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // text for the SMS box
  const orderForSms = useMemo(() => ({ reference: ref, customer_name: order.customer_name, network: order.network, bundle_size: order.bundle_size, amount, phone: order.phone }), [ref, order, amount]);
  useEffect(() => {
    if (smsId) setSmsText(smsTemplate(smsId, orderForSms));
  }, [smsId, orderForSms]);

  const waiting = statusLower === "pending_approval" ? getOrderReviewSecondsRemaining(order.created_at, now) : 0;
  const notOnListExpired = statusLower === "not_on_list" && !!order.not_on_list_at && (Date.now() - new Date(order.not_on_list_at).getTime()) / 3_600_000 >= NOT_ON_LIST_WINDOW_HOURS;
  const canComplete = ["processing", "pending", "pending_approval", "failed", "not_on_list"].includes(statusLower);
  const canRetry = ["pending", "processing", "failed", "not_on_list"].includes(statusLower);
  const canDelete = ["failed", "pending", "pending_approval", "processing"].includes(statusLower) || notOnListExpired;
  const canRefund = (["failed", "rejected"].includes(statusLower) || notOnListExpired) && !refunded && amount > 0;
  const refundBlocked = ["processing", "completed"].includes(statusLower) && !refunded && amount > 0;
  // Money goes back to the number that paid. A different number the customer typed in later is shown as a warning only.
  // Orders paid from an agent wallet go back into that wallet automatically.
  const walletAuto = detail?.payment.kind === "wallet" && ref.startsWith("AGTWALLET-");
  const refundTo = detail?.payment.payerPhone || order.refund_phone || "";

  const finish = useCallback((text: string, ok = true, close = false) => {
    setMsg({ ok, text });
    if (ok) onChanged();
    if (ok && close) window.setTimeout(onClose, 1100);
  }, [onChanged, onClose]);

  async function approve() {
    setBusy(true); setMsg(null);
    const d = await api("/api/admin/orders/approve", "POST", { references: [ref], action: "approve" }).catch(() => null);
    setBusy(false);
    const r = (d?.results as Array<{ ok: boolean; message: string }> | undefined)?.[0];
    if (r?.ok) { onHandled?.(ref); finish("Approved. The data is being sent.", true, true); }
    else finish(r?.message ?? "Could not approve. Please try again.", false);
  }

  async function reject() {
    setBusy(true); setMsg(null);
    const d = await api("/api/admin/orders/approve", "POST", { references: [ref], action: "reject", reason, notifyCustomer: textCustomer, willRefund: refundNow }).catch(() => null);
    const r = (d?.results as Array<{ ok: boolean; message: string }> | undefined)?.[0];
    if (!r?.ok) { setBusy(false); finish(r?.message ?? "Could not reject. Please try again.", false); return; }
    setStatus("rejected");
    onHandled?.(ref);
    if (refundNow && walletAuto) {
      const rf = await api("/api/admin/orders/refund", "POST", { reference: ref }).catch(() => null);
      setBusy(false);
      if (rf?.success) { setRefunded(true); finish("Rejected. The money went back into the agent's wallet.", true, true); }
      else { finish(`Rejected. The wallet refund did not go through: ${String(rf?.error ?? "unknown error")}. Use Refund to try again.`, false); setView("detail"); }
      return;
    }
    setBusy(false);
    onChanged();
    if (refundNow) { setView("refund"); setMsg({ ok: true, text: "Rejected. Now send the money back and record it." }); }
    else finish("Rejected.", true, true);
  }

  async function refund() {
    setBusy(true); setMsg(null);
    const d = walletAuto
      ? await api("/api/admin/orders/refund", "POST", { reference: ref }).catch(() => null)
      : await api("/api/admin/orders/patch", "POST", { reference: ref, refunded: true }).catch(() => null);
    setBusy(false);
    if (d?.success) { setRefunded(true); setStatus("refunded"); finish(walletAuto ? "Refunded into the agent's wallet." : "Refund recorded. The customer has been texted.", true, true); }
    else finish(String(d?.error ?? "Could not record the refund."), false);
  }

  async function sendSms() {
    setBusy(true); setMsg(null);
    const d = await api("/api/admin/send-sms", "POST", { phone: order.phone, message: smsText }).catch(() => null);
    setBusy(false);
    if (d?.success) { finish("Text sent.", true); setView("detail"); }
    else finish(String(d?.error ?? "The text could not be sent."), false);
  }

  async function simple(path: string, body: Record<string, unknown>, okText: string, method: "POST" | "DELETE" = "POST") {
    setBusy(true); setMsg(null);
    const d = await api(path, method, body).catch(() => null);
    setBusy(false); setConfirm(null);
    if (d?.success) { if (method === "DELETE") onHandled?.(ref); finish(okText, true, method === "DELETE" || body.status === "processing"); }
    else finish(String(d?.error ?? "That did not work. Please try again."), false);
  }

  function copyDetails() {
    const text = `${ref}\n${label}\nTo ${order.phone}\n${money(amount)}\n${statusLower}`;
    navigator.clipboard?.writeText(text).then(() => setMsg({ ok: true, text: "Order details copied." }), () => setMsg({ ok: false, text: "Could not copy." }));
  }

  const title = view === "reject" ? "Reject this order?" : view === "refund" ? `Refund ${money(amount)}` : view === "sms" ? "Text the customer" : null;

  return (
    <div className="ed-overlay" onClick={onClose}>
      <div className="ed-sheet dk" role="dialog" aria-modal="true" aria-label={title ?? `Order ${ref}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="ed-grab" />
        <div className="ad-sheet-title">
          {title ? <b>{title}</b> : <b className="ed-num" style={{ fontSize: 17 }}>{ref}</b>}
          <button type="button" className="ad-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="ad-sheet-scroll">
          {msg && <p className={`ad-msg ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</p>}

          {view === "detail" && (
            <>
              <div className="ad-ohead">
                <div className="big"><span className="d">{label}</span><span className="p">{money(amount)}</span></div>
                <div className="ad-num">
                  <Icon name="phone" small />{spaced(order.phone)}
                  <span className="ad-chipok" style={{ background: "rgba(255,255,255,.07)", color: "var(--ed-text)" }}>{statusLower.replace(/_/g, " ")}</span>
                </div>
              </div>

              <dl className="ad-kv">
                <div><dt>Paid by</dt><dd>
                  {!detail ? "Loading…" : detail.payment.kind === "momo"
                    ? `Mobile Money${detail.payment.payerNetwork ? `, ${detail.payment.payerNetwork}` : ""}${detail.payment.payerPhone ? `, from ${spaced(detail.payment.payerPhone)}` : ""}`
                    : detail.payment.kind === "wallet" ? "Wallet (agent or API)" : "Card (old order)"}
                </dd></div>
                <div><dt>Customer</dt><dd>
                  {!detail ? "Loading…" : `${detail.customer.today > 1 ? `${detail.customer.today} orders today, ` : ""}${detail.customer.total} in total, ${detail.customer.refunds === 0 ? "no refunds" : `${detail.customer.refunds} refund${detail.customer.refunds > 1 ? "s" : ""}`}`}
                </dd></div>
              </dl>

              {(detail?.notes.length || order.risk_flags?.length) ? (
                <div className="ad-chips2">
                  {[...(detail?.notes ?? []), ...(order.risk_flags ?? [])].map((n) => <span key={n} className="ad-chipwarn">{n}</span>)}
                </div>
              ) : null}

              <div className="ad-acts">
                {statusLower === "pending_approval" && (
                  waiting > 0
                    ? <p className="ad-warn" style={{ textAlign: "center", fontWeight: 700 }}>Review this order. Buttons unlock in {waiting} seconds.</p>
                    : <button type="button" className="ed-btn g tall block" disabled={busy} onClick={() => void approve()}>{busy ? "Working…" : "Approve and send data"}</button>
                )}
                <div className="ad-acts3" style={{ gridTemplateColumns: statusLower === "pending_approval" ? "repeat(3, 1fr)" : "repeat(2, 1fr)" }}>
                  {statusLower === "pending_approval" && (
                    <button type="button" className="ed-btn r" disabled={waiting > 0 || busy} onClick={() => { setMsg(null); setView("reject"); }}>Reject</button>
                  )}
                  <button type="button" className="ed-btn o" onClick={() => { setMsg(null); setView("sms"); }}><Icon name="sms" small />SMS</button>
                  {refunded ? (
                    <div className="ed-btn lock" style={{ borderStyle: "solid", color: "var(--ed-green)" }}>Refunded</div>
                  ) : canRefund ? (
                    <button type="button" className="ed-btn o" style={{ borderColor: "rgba(245,158,11,.5)", color: "var(--ed-amber)" }} onClick={() => { setMsg(null); setView("refund"); }}><Icon name="refund" small />Refund</button>
                  ) : (
                    <div className="ed-btn lock" aria-disabled="true"><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="lock" small />Refund</span><small>{refundBlocked ? (statusLower === "processing" ? "Still sending" : "Delivered") : "After reject or fail"}</small></div>
                  )}
                </div>
              </div>

              <div className="ad-more">
                <a href={`https://wa.me/${waNumber(order.phone)}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" small />Open WhatsApp<small>{spaced(order.phone)}</small></a>
                <button type="button" onClick={copyDetails}><Icon name="copy" small />Copy order details</button>

                {statusLower === "pending_approval" && (confirm === "processing" ? (
                  <div style={{ display: "block", minHeight: 0, padding: "10px 0" }}>
                    <p className="ad-info" style={{ marginBottom: 8 }}>Move to Processing? This skips the data provider. Use it only when you have sent the data yourself.</p>
                    <div className="ad-acts3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <button type="button" className="ed-btn o" onClick={() => setConfirm(null)}>No</button>
                      <button type="button" className="ed-btn b" disabled={busy} onClick={() => void simple("/api/admin/orders/patch", { reference: ref, status: "processing" }, "Moved to Processing.")}>Yes, I sent it</button>
                    </div>
                  </div>
                ) : <button type="button" onClick={() => setConfirm("processing")}><Icon name="hand" small />Mark as sent by hand</button>)}

                {canRetry ? <button type="button" disabled={busy} onClick={() => void simple("/api/admin/orders/retry", { reference: ref }, "Sent to the network again.")}><Icon name="retry" small />Retry delivery</button>
                  : <div className="off"><Icon name="retry" small />Retry delivery<small>Only after a failure</small></div>}

                {canComplete && (confirm === "complete" ? (
                  <div style={{ display: "block", minHeight: 0, padding: "10px 0" }}>
                    <p className="ad-info" style={{ marginBottom: 8 }}>Mark this order as completed? Agent commission will be credited.</p>
                    <div className="ad-acts3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <button type="button" className="ed-btn o" onClick={() => setConfirm(null)}>No</button>
                      <button type="button" className="ed-btn g" disabled={busy} onClick={() => void simple("/api/admin/orders/force-complete", { reference: ref }, "Marked complete.")}>Yes, mark complete</button>
                    </div>
                  </div>
                ) : <button type="button" onClick={() => setConfirm("complete")}><Icon name="check" small />Mark complete</button>)}
              </div>

              {canDelete && (
                <HoldButton label="Hold to delete this order" tone="red" disabled={busy} onConfirm={() => void simple("/api/admin/orders/patch", { reference: ref }, "Order deleted.", "DELETE")} />
              )}

              {detail && detail.timeline.length > 0 && (
                <div className="ad-tl">
                  <b>History</b>
                  {detail.timeline.map((t, i) => <div key={i}><span>{t.text}</span><span className="ed-num">{timeOf(t.at)}</span></div>)}
                </div>
              )}
            </>
          )}

          {view === "reject" && (
            <>
              <div>
                <span className="lt" style={{ color: "var(--ed-muted)", display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700 }}>Reason</span>
                <div className="ad-chips2" role="radiogroup" aria-label="Reason">
                  {REJECT_REASONS.map((r) => (
                    <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className={`ad-ch2${reason === r.id ? " on" : ""}`} onClick={() => setReason(r.id)}>{r.label}</button>
                  ))}
                </div>
              </div>
              <div className="ad-trow"><div className="t"><b>Text the customer</b>Sends the message below</div>
                <button type="button" role="switch" aria-checked={textCustomer} aria-label="Text the customer" className="ad-sw" onClick={() => setTextCustomer((v) => !v)} /></div>
              {textCustomer && <p className="ad-preview">{rejectionSms({ reference: ref, reason, amount, willRefund: refundNow })}</p>}
              <div className="ad-trow"><div className="t"><b>{walletAuto ? `Refund ${money(amount)} to the wallet` : "Then send the refund"}</b>{walletAuto ? "The money goes back into the agent's wallet" : "You send the money by Mobile Money, then record it"}</div>
                <button type="button" role="switch" aria-checked={refundNow} aria-label="Refund after rejecting" className="ad-sw" onClick={() => setRefundNow((v) => !v)} /></div>
              <HoldButton label={refundNow ? "Hold to reject and refund" : "Hold to reject"} disabled={busy} onConfirm={() => void reject()} />
              <button type="button" className="ed-btn o block" onClick={() => setView("detail")}>Back</button>
            </>
          )}

          {view === "refund" && (
            <>
              {walletAuto ? (
                  <p className="ad-info">This order was paid from an agent wallet, so <b>{money(amount)}</b> goes back into that wallet when you confirm.</p>
                ) : (
                <>
                  <p className="ad-info">
                    This order was paid by {detail?.payment.kind === "wallet" ? "wallet" : detail?.payment.kind === "card" ? "card (before card payments were removed)" : "Mobile Money"}, so the money is sent back by hand. Send <b>{money(amount)}</b>{refundTo ? <> to <b className="ed-num">{spaced(refundTo)}</b></> : null}, then record it here.
                  </p>
                  {refundTo && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="ad-copybtn" onClick={() => navigator.clipboard?.writeText(refundTo.replace(/\s/g, ""))}>Copy number</button>
                      <button type="button" className="ad-copybtn" onClick={() => navigator.clipboard?.writeText(amount.toFixed(2))}>Copy amount</button>
                    </div>
                  )}
                  {order.refund_phone && detail?.payment.payerPhone && order.refund_phone !== detail.payment.payerPhone && (
                    <p className="ad-warn">The customer asked for the refund on {spaced(order.refund_phone)}, but the payment came from {spaced(detail.payment.payerPhone)}. Send it to the number that paid unless you have checked with the customer on WhatsApp.</p>
                  )}
                  {!refundTo && <p className="ad-warn">No refund number is on file. Ask the customer for one on WhatsApp before sending.</p>}
                </>
              )}
              <p className="ad-warn" style={{ background: "transparent", color: "var(--ed-muted)", padding: 0 }}>The customer gets an SMS when the refund is recorded. A refund can only be made once, and not on delivered orders.</p>
              <HoldButton tone="green" label={walletAuto ? `Hold to refund ${money(amount)} to wallet` : `Hold to record refund ${money(amount)}`} disabled={busy || !canRefund} onConfirm={() => void refund()} />
              {!canRefund && !refunded && <p className="ad-warn">Refund opens after the order is rejected or has failed.</p>}
              <button type="button" className="ed-btn o block" onClick={() => setView("detail")}>Back</button>
            </>
          )}

          {view === "sms" && (
            <>
              <div className="ad-chips2" role="radiogroup" aria-label="Message">
                {SMS_TEMPLATES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={smsId === t.id} className={`ad-ch2${smsId === t.id ? " on" : ""}`} onClick={() => setSmsId(t.id)}>{t.label}</button>
                ))}
              </div>
              <textarea className="ad-ta" aria-label="Message to send" value={smsText} maxLength={500} onChange={(e) => { setSmsText(e.target.value); setSmsId(null); }} />
              <p className="ad-cnt">{smsText.length} of 160 characters, {smsParts(smsText)} SMS</p>
              <button type="button" className="ed-btn g tall block" disabled={busy || smsText.trim().length === 0} onClick={() => void sendSms()}><Icon name="sms" small />{busy ? "Sending…" : `Send to ${spaced(order.phone)}`}</button>
              <button type="button" className="ed-btn o block" onClick={() => setView("detail")}>Back</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
