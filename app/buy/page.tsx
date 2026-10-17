"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bundle } from "@/lib/bundles";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import Icon from "@/components/ed/Icon";
import { NETWORK_META, NETWORK_ORDER, parseNetwork, type BuyNetwork } from "@/lib/ed-networks";
import { readDraft, spacedPhone } from "@/lib/client/order-draft";

type MashupBundle = { id: string; name: string; data_value: number; data_unit: string; minutes: number; price: number };

type SizeFilter = "all" | "small" | "medium" | "large";
const FILTERS: Array<{ id: SizeFilter; label: string }> = [
  { id: "all", label: "All sizes" },
  { id: "small", label: "1 to 5GB" },
  { id: "medium", label: "6 to 15GB" },
  { id: "large", label: "20GB and up" },
];

const money = (n: number) => `GH₵${n.toFixed(2)}`;

function BuyContent() {
  const params = useSearchParams();
  const router = useRouter();
  const viaCode = params.get("via") ?? undefined;
  const netParam = params.get("network");

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [mashupBundles, setMashupBundles] = useState<MashupBundle[]>([]);
  const [activeNet, setActiveNet] = useState<BuyNetwork>(parseNetwork(netParam));
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [referralVia, setReferralVia] = useState<string | undefined>();
  const [recipient, setRecipient] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState({ mtn: true, telecel: true, at: true, mashup: true });
  const [slowDelivery, setSlowDelivery] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/network-status")
      .then((r) => r.json())
      .then((d) => {
        setSlowDelivery(d.slowDelivery === true);
        const status = { mtn: d.mtn !== false, telecel: d.telecel !== false, at: d.at !== false, mashup: d.mashup !== false };
        setNetStatus(status);
        if (!netParam) {
          const map: Record<BuyNetwork, boolean> = { mtn: status.mtn, telecel: status.telecel, airteltigo: status.at, mashup: status.mashup };
          const first = NETWORK_ORDER.find((n) => map[n] !== false);
          if (first) setActiveNet(first);
        }
      })
      .catch(() => {});
  }, [netParam]);

  useEffect(() => {
    Promise.all([
      fetch("/api/bundles").then((r) => r.json()).catch(() => ({ bundles: [] })),
      fetch("/api/mashup-bundles").then((r) => r.json()).catch(() => ({ bundles: [] })),
    ]).then(([std, mash]) => {
      setBundles(std.bundles ?? []);
      setMashupBundles(mash.bundles ?? []);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (viaCode) { sessionStorage.setItem("referralVia", viaCode); setReferralVia(viaCode); }
        else { const s = sessionStorage.getItem("referralVia"); if (s) setReferralVia(s); }
      } catch { /* private mode */ }
      const d = readDraft();
      if (d.recipient) setRecipient(d.recipient);
    }, 0);
    return () => clearTimeout(t);
  }, [viaCode]);

  const statusMap: Record<BuyNetwork, boolean> = { mtn: netStatus.mtn, telecel: netStatus.telecel, airteltigo: netStatus.at, mashup: netStatus.mashup };
  const visibleNets = NETWORK_ORDER.filter((n) => statusMap[n] !== false);
  const net = visibleNets.includes(activeNet) ? activeNet : (visibleNets[0] ?? "mtn");
  const meta = NETWORK_META[net];

  const inSize = (b: Bundle) => {
    const gb = b.sizeGB ?? 0;
    if (sizeFilter === "small") return gb <= 5;
    if (sizeFilter === "medium") return gb > 5 && gb <= 15;
    if (sizeFilter === "large") return gb >= 20;
    return true;
  };
  const filtered: Bundle[] = net === "mashup"
    ? []
    : bundles.filter((b) => b.network === net && inSize(b)).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));

  const pool = bundles.filter((b) => b.network === net);
  const bestId = pool.length < 2
    ? null
    : pool.reduce((best, b) => (b.sizeGB / b.price > best.sizeGB / best.price ? b : best), pool[0]).id;

  let selected: { id: string; label: string; sub: string; price: number } | null = null;
  if (selectedId) {
    if (net === "mashup") {
      const m = mashupBundles.find((b) => b.id === selectedId);
      if (m) selected = { id: m.id, label: m.name, sub: m.minutes > 0 ? `Includes ${m.minutes} minutes` : "30 days", price: m.price };
    } else {
      const b = filtered.find((x) => x.id === selectedId) ?? bundles.find((x) => x.id === selectedId);
      if (b) selected = { id: b.id, label: `${meta.label} ${b.size}`, sub: b.validity || "Never expires", price: b.price };
    }
  }

  function pickNetwork(id: BuyNetwork) {
    setActiveNet(id);
    setSizeFilter("all");
    setSelectedId(null);
  }

  function goContinue() {
    if (!selected) return;
    const q = new URLSearchParams({ bundle: selected.id });
    if (referralVia) q.set("via", referralVia);
    router.push(`/checkout?${q.toString()}`);
  }

  const changeHref = (() => {
    const q = new URLSearchParams({ network: net });
    if (referralVia) q.set("via", referralVia);
    return `/buy/number?${q.toString()}`;
  })();

  return (
    <div className="ed-page" style={{ ["--ed-net" as string]: meta.color, ["--ed-net-ink" as string]: meta.ink, paddingBottom: 120 }}>
      <div className="ed-band">
        <div className="ed-appbar">
          <Link href="/" className="ed-ibtn plain" aria-label="Back to home"><Icon name="back" /></Link>
          <h1 className="ed-appbar-title" style={{ margin: 0 }}>{meta.label} data</h1>
          <span className="ed-spacer" />
          <Link href="/track" className="ed-ibtn plain" aria-label="Track an order"><Icon name="track" /></Link>
        </div>
        <div className="ed-seg" role="tablist" aria-label="Network">
          {visibleNets.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={id === net} aria-current={id === net} onClick={() => pickNetwork(id)}>
              {NETWORK_META[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="ed-wrap ed-stack" style={{ paddingTop: 16 }}>
        <AnnouncementBanner target="customers" />

        {slowDelivery && (
          <div className="ed-chk warn">Deliveries are a little slower than usual today. Your order will still arrive. Thank you for your patience.</div>
        )}

        <div className="ed-lrow" style={{ minHeight: 56 }}>
          <div className="t" style={{ flex: 1 }}>
            Sending to
            <b className="ed-num" style={{ fontSize: 17 }}>{recipient ? spacedPhone(recipient) : "No number yet"}</b>
          </div>
          <Link href={changeHref} className="ed-link" style={{ minHeight: 44, display: "inline-grid", placeItems: "center", padding: "0 4px" }}>
            {recipient ? "Change" : "Add number"}
          </Link>
        </div>

        {net !== "mashup" && (
          <div className="ed-chips" role="group" aria-label="Filter by size" style={{ flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2 }}>
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={`ed-chip${sizeFilter === f.id ? " on" : ""}`} onClick={() => setSizeFilter(f.id)} style={{ whiteSpace: "nowrap" }}>{f.label}</button>
            ))}
          </div>
        )}

        {!loaded ? (
          <div className="ed-grid2" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 118, borderRadius: 14, background: "var(--ed-card)", border: "1px solid var(--ed-line)" }} />)}
          </div>
        ) : net === "mashup" ? (
          mashupBundles.length === 0 ? (
            <p className="ed-muted" style={{ textAlign: "center", padding: "48px 0" }}>No mashup bundles are available right now. Please check back later.</p>
          ) : (
            <div className="ed-grid2">
              {mashupBundles.map((b) => (
                <button key={b.id} type="button" className={`ed-tile${selectedId === b.id ? " sel" : ""}`} aria-pressed={selectedId === b.id} onClick={() => setSelectedId(b.id)}>
                  <span className="sz" style={{ fontSize: 22 }}>{b.name}</span>
                  <span className="vd">{b.minutes > 0 ? `${b.minutes} minutes included` : "Data only"}, 30 days</span>
                  <span className="pr">{money(b.price)}</span>
                </button>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p className="ed-muted">No bundles match this size.</p>
            <button type="button" className="ed-btn y" onClick={() => setSizeFilter("all")}>Show all {meta.label} bundles</button>
          </div>
        ) : (
          <div className="ed-grid2">
            {filtered.map((b) => {
              const perGb = b.sizeGB > 0 ? b.price / b.sizeGB : null;
              const tag = b.id === bestId ? "Best value" : b.popular ? "Popular" : null;
              return (
                <button key={b.id} type="button" className={`ed-tile${selectedId === b.id ? " sel" : ""}${b.id === bestId ? " best" : ""}`} aria-pressed={selectedId === b.id} onClick={() => setSelectedId(b.id)}>
                  {tag && <span className="tag">{tag}</span>}
                  <span className="sz">{b.size}</span>
                  <span className="vd">{b.validity || "Never expires"}</span>
                  <span className="pr">{money(b.price)}</span>
                  {perGb !== null && <span className="pg">{money(perGb)} per GB</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="ed-stack" style={{ gap: 6, marginTop: 8 }}>
          <p className="ed-muted" style={{ margin: 0, fontSize: 13 }}>Pay with Mobile Money. Most orders arrive in 1 to 3 minutes, and you get a full refund if a network outage stops delivery.</p>
          <a className="ed-link" href="https://wa.me/233509794503" target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="whatsapp" small /> Questions? Ask us on WhatsApp
          </a>
        </div>
      </div>

      <div className="ed-buybar">
        <div className="in">
          <div className="w">
            <small>{selected ? `${selected.label}, ${selected.sub}` : "Choose a bundle"}</small>
            <b>{selected ? money(selected.price) : "GH₵0.00"}</b>
          </div>
          <button type="button" className={`ed-btn tall ${selected ? "y" : "dis"}`} disabled={!selected} onClick={goContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}

export default function BuyPage() {
  return (
    <Suspense fallback={<div className="ed-page" style={{ display: "grid", placeItems: "center" }}><span className="ed-spin" style={{ width: 32, height: 32, color: "var(--ed-yellow)" }} /></div>}>
      <BuyContent />
    </Suspense>
  );
}
