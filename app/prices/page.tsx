"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { NETWORK_META, parseNetwork, type BuyNetwork } from "@/lib/ed-networks";

type BundleItem = { id: string; network: BuyNetwork; size: string; sizeGB: number; validity: string; price: number; costPrice: number; popular?: boolean };

const NETS: BuyNetwork[] = ["mtn", "telecel", "airteltigo"];

const USAGE = [
  { id: "whatsapp", label: "WhatsApp", gbPerHour: 0.03 },
  { id: "social", label: "Social media", gbPerHour: 0.15 },
  { id: "youtube", label: "YouTube", gbPerHour: 0.7 },
  { id: "netflix", label: "Netflix", gbPerHour: 1.5 },
  { id: "browsing", label: "Browsing", gbPerHour: 0.05 },
  { id: "zoom", label: "Video calls", gbPerHour: 0.5 },
];

const money = (n: number) => `GH₵${Number(n).toFixed(2)}`;

export default function PricesPage() {
  const [activeNet, setActiveNet] = useState<BuyNetwork>("mtn");
  const [all, setAll] = useState<BundleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<Record<string, number>>({ whatsapp: 0, social: 0, youtube: 0, netflix: 0, browsing: 0, zoom: 0 });
  const [calcNet, setCalcNet] = useState<BuyNetwork>("mtn");

  useEffect(() => {
    fetch("/api/bundles")
      .then((r) => r.json())
      .then((d) => { setAll(d.bundles ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const meta = NETWORK_META[activeNet];
  const shown = useMemo(() => all.filter((b) => b.network === activeNet).sort((a, b) => a.sizeGB - b.sizeGB), [all, activeNet]);
  const bestId = useMemo(() => {
    if (shown.length < 2) return "";
    return shown.reduce((best, b) => (b.price / b.sizeGB < best.price / best.sizeGB ? b : best), shown[0]).id;
  }, [shown]);

  const totalGB = USAGE.reduce((sum, u) => sum + u.gbPerHour * (hours[u.id] ?? 0) * 30, 0);
  const recommended = useMemo(
    () => all.filter((b) => b.network === calcNet && b.sizeGB >= totalGB).sort((a, b) => a.price - b.price)[0] ?? null,
    [all, calcNet, totalGB],
  );

  return (
    <div className="ed-page" style={{ ["--ed-net" as string]: meta.color, ["--ed-net-ink" as string]: meta.ink, paddingBottom: 100 }}>
      <div className="ed-wrap wide ed-stack" style={{ paddingTop: 24, gap: 24 }}>
        <div className="ed-stack" style={{ gap: 8 }}>
          <h1 className="ed-h1" style={{ fontSize: "clamp(28px,7vw,44px)" }}>Bundle prices</h1>
          <p className="ed-muted" style={{ margin: 0, maxWidth: 520 }}>Every data bundle on every network. Prices are live. Tap a bundle to buy it.</p>
        </div>

        <div className="ed-seg" role="tablist" aria-label="Network" style={{ background: "var(--ed-card)", alignSelf: "flex-start" }}>
          {NETS.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={activeNet === n} aria-current={activeNet === n}
              style={activeNet === n ? { background: NETWORK_META[n].color, color: NETWORK_META[n].ink } : { color: "var(--ed-text)" }}
              onClick={() => setActiveNet(n)}>{NETWORK_META[n].label}</button>
          ))}
        </div>

        {loading ? (
          <div className="ed-grid2" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 118, borderRadius: 14, background: "var(--ed-card)", border: "1px solid var(--ed-line)" }} />)}</div>
        ) : shown.length === 0 ? (
          <p className="ed-muted">No bundles are listed for {meta.label} right now.</p>
        ) : (
          <div className="ed-grid2">
            {shown.map((b) => {
              const tag = b.id === bestId ? "Best value" : b.popular ? "Popular" : null;
              return (
                <Link key={b.id} href={`/buy/number?network=${b.network}&bundle=${encodeURIComponent(b.id)}`} className={`ed-tile${b.id === bestId ? " best" : ""}`} style={{ textDecoration: "none" }}>
                  {tag && <span className="tag">{tag}</span>}
                  <span className="sz">{b.size}</span>
                  <span className="vd">{b.validity || "Never expires"}</span>
                  <span className="pr">{money(b.price)}</span>
                  <span className="pg">{money(b.price / b.sizeGB)} per GB</span>
                </Link>
              );
            })}
          </div>
        )}

        <section aria-labelledby="calc-h" className="ed-stack" style={{ gap: 14, borderTop: "1px solid var(--ed-line)", paddingTop: 26 }}>
          <div>
            <h2 id="calc-h" className="ed-h2">How much data do I need?</h2>
            <p className="ed-muted" style={{ margin: "6px 0 0", fontSize: 14 }}>Slide each one to the hours you use it every day. We suggest the cheapest bundle that covers a month.</p>
          </div>
          <div className="ed-seg" role="tablist" aria-label="Network for the suggestion" style={{ background: "var(--ed-card)", alignSelf: "flex-start" }}>
            {NETS.map((n) => (
              <button key={n} type="button" role="tab" aria-selected={calcNet === n} aria-current={calcNet === n}
                style={calcNet === n ? { background: NETWORK_META[n].color, color: NETWORK_META[n].ink } : { color: "var(--ed-text)" }}
                onClick={() => setCalcNet(n)}>{NETWORK_META[n].label}</button>
            ))}
          </div>
          <div className="ed-stack" style={{ gap: 4 }}>
            {USAGE.map((u) => (
              <div key={u.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr 60px", gap: 12, alignItems: "center", minHeight: 48 }}>
                <label htmlFor={`use-${u.id}`} style={{ fontSize: 14, fontWeight: 700 }}>{u.label}</label>
                <input id={`use-${u.id}`} type="range" min={0} max={8} step={0.5} value={hours[u.id]} onChange={(e) => setHours((h) => ({ ...h, [u.id]: Number(e.target.value) }))} style={{ width: "100%", minHeight: 44, accentColor: "#fbbf24" }} />
                <span className="ed-num ed-muted" style={{ fontSize: 13, textAlign: "right" }}>{hours[u.id]} h a day</span>
              </div>
            ))}
          </div>

          <div aria-live="polite" className="ed-vcard">
            {totalGB === 0 ? (
              <p>Move a slider to see what we suggest.</p>
            ) : (
              <>
                <p>You will use about <b style={{ color: "var(--ed-text)" }} className="ed-num">{totalGB.toFixed(1)} GB</b> a month.</p>
                {recommended ? (
                  <>
                    <h3>{NETWORK_META[parseNetwork(recommended.network)].label} {recommended.size} for {money(recommended.price)}</h3>
                    <p>{recommended.validity || "Never expires"}</p>
                    <Link href={`/buy/number?network=${recommended.network}&bundle=${encodeURIComponent(recommended.id)}`} className="ed-btn y">Buy this bundle</Link>
                  </>
                ) : (
                  <p>No single bundle covers this. Choose our largest bundle, or message us on WhatsApp for a custom order.</p>
                )}
              </>
            )}
          </div>
        </section>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" className="ed-btn y tall">Buy data</Link>
          <a href="https://wa.me/233509794503" target="_blank" rel="noopener noreferrer" className="ed-btn o tall">Ask us on WhatsApp</a>
        </div>
      </div>
    </div>
  );
}
