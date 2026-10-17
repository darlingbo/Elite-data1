"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/ed/Icon";
import { NETWORK_META, parseNetwork } from "@/lib/ed-networks";
import { detectGhProvider } from "@/lib/phone";
import { addRecent, readDraft, readRecents, spacedPhone, writeDraft, type RecentNumber } from "@/lib/client/order-draft";
import { useNumberCheck } from "@/lib/client/use-number-check";

const SUPPORT_WHATSAPP = "https://wa.me/233509794503";

function NumberStep() {
  const params = useSearchParams();
  const router = useRouter();
  const network = parseNetwork(params.get("network"));
  const bundleId = params.get("bundle") ?? "";
  const via = params.get("via") ?? "";
  const meta = NETWORK_META[network];

  const [value, setValue] = useState("");
  const [recents, setRecents] = useState<RecentNumber[]>([]);
  const { state, recheck, canContinue, phone } = useNumberCheck(value, network);

  // Pick up a number from earlier in this visit, and the customer's own recent numbers.
  useEffect(() => {
    const t = setTimeout(() => {
      const d = readDraft();
      if (d.recipient && d.network === network) setValue(spacedPhone(d.recipient));
      setRecents(readRecents().filter((r) => !r.network || r.network === network).slice(0, 4));
    }, 0);
    return () => clearTimeout(t);
  }, [network]);

  const query = new URLSearchParams();
  if (via) query.set("via", via);
  const backHref = bundleId ? `/buy?${new URLSearchParams({ network }).toString()}` : "/";

  function next() {
    if (!canContinue || !phone) return;
    writeDraft({ network, recipient: phone, verifiedFor: phone });
    addRecent(phone, network);
    if (bundleId) {
      query.set("bundle", bundleId);
      router.push(`/checkout?${query.toString()}`);
    } else {
      query.set("network", network);
      router.push(`/buy?${query.toString()}`);
    }
  }

  const detected = phone ? detectGhProvider(phone) : null;
  const expected = network === "airteltigo" ? "at" : network;
  const mismatch = detected && network !== "mashup" && detected !== expected
    ? (detected === "at" ? "an AirtelTigo" : detected === "mtn" ? "an MTN" : "a Telecel")
    : null;

  const fieldClass = state.phase === "verified" || state.phase === "skipped" ? "ok" : state.phase === "not_verified" || state.phase === "unreachable" || state.phase === "error" ? "bad" : "";

  return (
    <div className="ed-page" style={{ ["--ed-net" as string]: meta.color, ["--ed-net-ink" as string]: meta.ink, paddingBottom: 110 }}>
      <div className="ed-band">
        <div className="ed-appbar">
          <Link href={backHref} className="ed-ibtn plain" aria-label="Back"><Icon name="back" /></Link>
          <span className="ed-appbar-title">{meta.label} data</span>
        </div>
      </div>

      <div className="ed-wrap ed-stack" style={{ paddingTop: 20 }}>
        <h1 className="ed-h2">Who gets the data?</h1>

        <div className={`ed-nin ${fieldClass}`}>
          <span className="ed-nb" style={{ background: meta.color, color: meta.ink }}>{meta.label}</span>
          <input
            id="recipient"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="024 123 4567"
            aria-label="Phone number that gets the data"
            aria-describedby="recipient-status"
          />
          {state.phase === "verified" || state.phase === "skipped" ? <span style={{ color: "var(--ed-green)" }}><Icon name="check" /></span> : null}
          {state.phase === "not_verified" || state.phase === "unreachable" || state.phase === "error" ? <span style={{ color: "var(--ed-red)" }}><Icon name="x" /></span> : null}
        </div>

        <div id="recipient-status" aria-live="polite" className="ed-stack" style={{ gap: 10 }}>
          {state.phase === "checking" && (
            <div className="ed-chk wait"><span className="ed-spin" />Checking your number with {meta.label}. This takes a moment.</div>
          )}
          {state.phase === "verified" && (
            <div className="ed-chk ok"><Icon name="check" small />This {meta.label} number is verified and can receive data.</div>
          )}
          {state.phase === "skipped" && phone && (
            <div className="ed-chk ok"><Icon name="check" small />Number accepted.</div>
          )}
          {mismatch && (
            <div className="ed-chk warn">This looks like {mismatch} number, but you chose {meta.label}. If the number was moved to {meta.label}, you can continue.</div>
          )}
          {(state.phase === "unreachable" || state.phase === "error") && (
            <div className="ed-block">
              <b>We could not check this number.</b>
              <p>{state.message ?? "Please try again in a minute."}</p>
              <button type="button" className="ed-btn y" onClick={recheck}>Check again</button>
            </div>
          )}
          {state.phase === "not_verified" && (
            <>
              <div className="ed-block">
                <b>New number. Not verified yet.</b>
                <p>New numbers must be verified before they can buy data. Submit this number to be verified, then come back and tap Check again.</p>
                {state.verifyUrl ? (
                  <a className="ed-btn y" href={state.verifyUrl} target="_blank" rel="noopener noreferrer">
                    Submit number to be verified <Icon name="ext" small />
                  </a>
                ) : (
                  <a className="ed-btn y" href={SUPPORT_WHATSAPP} target="_blank" rel="noopener noreferrer">
                    Ask us on WhatsApp to verify it <Icon name="ext" small />
                  </a>
                )}
                <button type="button" className="ed-btn o" onClick={recheck}>Check again</button>
              </div>
              <button type="button" className="ed-link" style={{ minHeight: 44, background: "none", border: 0, textDecoration: "underline", cursor: "pointer", fontSize: 14 }} onClick={() => setValue("")}>Use a different number</button>
              <p className="ed-muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>No money has been taken.</p>
            </>
          )}
        </div>

        {recents.length > 0 && state.phase !== "not_verified" && (
          <div className="ed-chips" aria-label="Recent numbers">
            <span className="ed-muted" style={{ fontSize: 12 }}>Recent</span>
            {recents.map((r) => (
              <button key={r.phone} type="button" className="ed-chip" onClick={() => setValue(spacedPhone(r.phone))}>
                {r.label !== r.phone ? `${r.label} ` : ""}{spacedPhone(r.phone)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ed-buybar">
        <div className="in">
          <button type="button" className={`ed-btn tall block ${canContinue ? "y" : "dis"}`} disabled={!canContinue} onClick={next}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NumberStepPage() {
  return (
    <Suspense fallback={<div className="ed-page" />}>
      <NumberStep />
    </Suspense>
  );
}
