"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NETWORK_META, type BuyNetwork } from "@/lib/ed-networks";

type Item = { id: string; network: BuyNetwork; size: string; validity: string; price: number; popular?: boolean };

/** A short list of the bundles people buy most. Each row goes to the number step. */
export default function HomePopular() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/bundles")
      .then((r) => r.json())
      .then((d: { bundles?: Item[] }) => {
        const all = (d.bundles ?? []).filter((b) => b.network !== "mashup");
        const popular = all.filter((b) => b.popular);
        setItems((popular.length >= 3 ? popular : all).slice(0, 5));
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="popular-heading" className="ed-stack" style={{ gap: 4 }}>
      <h2 id="popular-heading" className="ed-h2" style={{ fontSize: 22 }}>Popular today</h2>
      <div>
        {items.map((b) => (
          <Link key={b.id} href={`/checkout?bundle=${encodeURIComponent(b.id)}`} className="ed-lrow">
            <span className="z">{b.size}</span>
            <span className="t"><b>{NETWORK_META[b.network].label}</b>{b.validity || "Never expires"}</span>
            <span className="p">GH₵{b.price.toFixed(2)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
