"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CheckoutModal from "@/components/CheckoutModal";
import Icon from "@/components/ed/Icon";
import type { Bundle } from "@/lib/bundles";
import { readDraft, readRecents } from "@/lib/client/order-draft";

type MashupBundle = { id: string; name: string; data_value: number; data_unit: string; minutes: number; price: number };

function CheckoutContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bundleId = params.get("bundle") ?? "";
  const referralVia = params.get("via") ?? undefined;
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [isMashup, setIsMashup] = useState(false);
  const [initialRecipient, setInitialRecipient] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!bundleId) { setTimeout(() => setError("No bundle was selected."), 0); return; }
    const bundleUrl = "/api/bundles";
    Promise.all([
      fetch(bundleUrl).then((response) => response.json()),
      fetch("/api/mashup-bundles").then((response) => response.json()).catch(() => ({ bundles: [] })),
    ]).then(([standard, mashup]: [{ bundles?: Bundle[] }, { bundles?: MashupBundle[] }]) => {
      // The number box starts empty unless this phone has bought before: then it offers the last one.
      setInitialRecipient(readDraft().recipient ?? readRecents()[0]?.phone ?? "");
      const standardMatch = (standard.bundles ?? []).find((item) => item.id === bundleId);
      if (standardMatch) { setBundle(standardMatch); return; }
      const mashupMatch = (mashup.bundles ?? []).find((item) => item.id === bundleId);
      if (mashupMatch) {
        setIsMashup(true);
        setBundle({
          id: mashupMatch.id,
          network: "mtn",
          size: mashupMatch.minutes > 0 ? `${mashupMatch.data_value}${mashupMatch.data_unit} + ${mashupMatch.minutes}min` : `${mashupMatch.data_value}${mashupMatch.data_unit}`,
          sizeGB: mashupMatch.data_unit === "MB" ? mashupMatch.data_value / 1024 : mashupMatch.data_value,
          price: mashupMatch.price,
          costPrice: 0,
          validity: "30 days",
        });
        return;
      }
      setError("This bundle is no longer available. Please choose another one.");
    }).catch(() => setError("Checkout could not load. Please try again."));
  }, [bundleId]);

  const buyHref = bundle ? `/buy?network=${isMashup ? "mashup" : bundle.network}` : "/buy";

  if (error) {
    return (
      <div className="ed-page" style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <div className="ed-stack" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 className="ed-h2">Checkout unavailable</h1>
          <p className="ed-muted" style={{ margin: 0 }}>{error}</p>
          <Link href={buyHref} className="ed-btn y tall">Choose a bundle</Link>
        </div>
      </div>
    );
  }

  if (!bundle || initialRecipient === null) {
    return <div className="ed-page" style={{ display: "grid", placeItems: "center" }}><span className="ed-spin" style={{ width: 32, height: 32, color: "var(--ed-yellow)" }} /></div>;
  }

  return (
    <div className="ed-paper" style={{ minHeight: "100vh" }}>
      <div className="ed-appbar" style={{ background: "#fff", borderBottom: "1px solid var(--ed-g200)", color: "var(--ed-ink)" }}>
        <Link href={buyHref} className="ed-ibtn plain" aria-label="Back to bundles" style={{ color: "var(--ed-ink)" }}><Icon name="back" /></Link>
        <h1 className="ed-appbar-title" style={{ margin: 0 }}>Pay</h1>
        <span className="ed-spacer" />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ed-g500)" }}><Icon name="shield" small />Secure checkout</span>
      </div>
      <CheckoutModal
        bundle={bundle}
        isMashup={isMashup}
        initialRecipient={initialRecipient}
        referralVia={referralVia}
        onClose={() => router.push(buyHref)}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<div className="ed-page" />}><CheckoutContent /></Suspense>;
}
