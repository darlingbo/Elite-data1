"use client";
import { useState, useEffect } from "react";
import { Bundle, Network } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";

const NETS = [
  { id: "mtn" as Network,        label: "MTN",        color: "#f59e0b" },
  { id: "telecel" as Network,    label: "Telecel",    color: "#ef4444" },
  { id: "airteltigo" as Network, label: "AirtelTigo", color: "#3b82f6" },
];

const D = { bg: "#080f1e", card: "#0d1b2e", border: "#1e3a5f", text: "#e2e8f0", muted: "#64748b" };

export default function Preview2() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [net, setNet] = useState<Network>("mtn");
  const [selected, setSelected] = useState<Bundle | null>(null);

  useEffect(() => { fetch("/api/bundles").then(r => r.json()).then(d => setBundles(d.bundles ?? [])); }, []);

  const active = NETS.find(n => n.id === net)!;
  const filtered = bundles.filter(b => b.network === net).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const bestId = filtered.length ? filtered.reduce((bst, b) => (b.sizeGB / b.price) > (bst.sizeGB / bst.price) ? b : bst, filtered[0]).id : null;

  return (
    <div style={{ minHeight: "100vh", background: D.bg, fontFamily: "system-ui,sans-serif", color: D.text }}>
      <div style={{ background: "#1e293b", color: "#94a3b8", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "6px 0", letterSpacing: 1 }}>PREVIEW 2 — SWIPE / SINGLE COLUMN · <a href="/buy/preview" style={{ color: "#60a5fa" }}>← All options</a></div>

      <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px 80px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 4px" }}>Buy Data Bundles</h1>
        <p style={{ color: D.muted, fontSize: 13, margin: "0 0 24px" }}>⚡ Instant delivery · Secured by Paystack</p>

        {/* Network pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {NETS.map(n => (
            <button key={n.id} onClick={() => setNet(n.id)} style={{ flex: 1, padding: "10px 4px", borderRadius: 99, border: `2px solid ${net === n.id ? n.color : D.border}`, background: net === n.id ? `${n.color}18` : "transparent", color: net === n.id ? n.color : D.muted, fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all .2s" }}>
              {n.label}
            </button>
          ))}
        </div>

        {/* Single-column cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(b => (
            <button key={b.id} onClick={() => setSelected(b)} style={{ background: b.id === bestId ? `${active.color}10` : D.card, border: `2px solid ${b.id === bestId ? active.color : D.border}`, borderRadius: 18, padding: "18px 20px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
              {b.id === bestId && <span style={{ position: "absolute", top: -10, left: 20, background: active.color, color: "white", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 20 }}>⭐ Best Value</span>}
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 28, fontWeight: 900, color: D.text, lineHeight: 1 }}>{b.size}</p>
                <p style={{ margin: 0, fontSize: 12, color: D.muted }}>{b.validity ?? "30 days validity"}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 900, color: active.color }}>GH₵{b.price.toFixed(2)}</p>
                <div style={{ background: active.color, color: "white", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 800 }}>Buy Now ⚡</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && <CheckoutModal bundle={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
