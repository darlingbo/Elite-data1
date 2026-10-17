"use client";
import { useState } from "react";

type StatusAnswer = { status?: string; order?: Record<string, unknown>; orderError?: string };

/**
 * Shown when we stopped waiting for a Mobile Money approval. The customer may still have
 * approved it, so it offers to ask again and gives the reference to track the payment.
 */
export default function PaymentLate({ reference, onPaid, onFailed }: {
  reference: string;
  onPaid: (answer: StatusAnswer) => void | Promise<void>;
  onFailed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function check() {
    setBusy(true);
    setNote("");
    try {
      const answer = (await (await fetch(`/api/yebeck/status?reference=${encodeURIComponent(reference)}`)).json()) as StatusAnswer;
      if (answer.status === "success") await onPaid(answer);
      else if (answer.status === "failed") onFailed();
      else setNote("Still no approval from Mobile Money. If you approved the prompt, wait a minute and check again.");
    } catch {
      setNote("We could not check right now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ed-note warn" role="alert">
      <b>We have not seen your approval yet.</b>
      <p style={{ margin: "6px 0" }}>
        If you approved the prompt, your payment is safe. Tap the button to check again, or look it up on the Track page with this reference: <b className="ed-num">{reference}</b>
      </p>
      {note && <p style={{ margin: "6px 0", fontSize: 13 }}>{note}</p>}
      <button type="button" className="ed-btn y block" style={{ minHeight: 48 }} disabled={busy} onClick={() => void check()}>
        {busy ? "Checking…" : "I approved it, check again"}
      </button>
      <a className="ed-btn o block" style={{ minHeight: 44, marginTop: 8 }} href={`/track?ref=${encodeURIComponent(reference)}`}>Track this payment</a>
    </div>
  );
}
