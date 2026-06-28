"use client";
import { useState, useEffect } from "react";
import { Bundle, Network } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";

const NETS = [
  { id: "mtn" as Network,        label: "MTN",        color: "#f59e0b", bg: "#78350f", logo: "M" },
  { id: "telecel" as Network,    label: "Telecel",    color: "#ef4444", bg: "#7f1d1d", logo: "T" },
  { id: "airteltigo" as Network, label: "AirtelTigo", color: "#3b82f6", bg: "#1e3a8a", logo: "A" },
];

export default function Preview1() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [net, setNet] = useState<Network>("mtn");
  const [selected, setSelected] = useState<Bundle | null>(null);

  useEffect(() => { fetch("/api/bundles").then(r => r.json()).then(d => setBundles(d.bundles ?? [])); }, []);

  const active = NETS.find(n => n.id === net)!;
  const filtered = bundles.filter(b => b.network === net).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const bestId = filtered.length ? filtered.reduce((bst, b) => (b.sizeGB / b.price) > (bst.sizeGB / bst.price) ? b : bst, filtered[0]).id : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui,sans-serif" }}>
      {/* Label */}
      <div style={{ background: "#1e293b", color: "#94a3b8", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "6px 0", letterSpacing: 1 }}>PREVIEW 1 — BOLD NETWORK HERO · <a href="/buy/preview" style={{ color: "#60a5fa" }}>← All options</a></div>

      {/* Network hero tabs */}
      <div style={{ display: "flex" }}>
        {NETS.map(n => (
          <button key={n.id} onClick={() => setNet(n.id)} style={{ flex: 1, padding: "24px 8px 20px", border: "none", cursor: "pointer", background: net === n.id ? n.color : "#e2e8f0", transition: "all .2s" }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: net === n.id ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20, color: net === n.id ? "white" : "#64748b", margin: "0 auto 8px" }}>{n.logo}</div>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 14, color: net === n.id ? "white" : "#64748b" }}>{n.label}</p>
          </button>
        ))}
      </div>

      {/* Active network banner */}
      <div style={{ background: active.color, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "white" }}>{active.logo}</div>
        <div>
          <p style={{ margin: 0, fontWeight: 900, color: "white", fontSize: 15 }}>{active.label} Data Bundles</p>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.8)", fontSize: 12 }}>⚡ Instant delivery · Secured by Paystack</p>
        </div>
      </div>

      {/* Bundle grid */}
      <div style={{ padding: "20px 16px 80px", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {filtered.map(b => (
            <button key={b.id} onClick={() => setSelected(b)} style={{ background: "white", border: `2px solid ${b.id === bestId ? active.color : "#e2e8f0"}`, borderRadius: 18, padding: 16, cursor: "pointer", textAlign: "left", position: "relative", boxShadow: b.id === bestId ? `0 4px 20px ${active.color}30` : "0 2px 8px rgba(0,0,0,0.06)" }}>
              {b.id === bestId && <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: active.color, color: "white", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ Best Value</span>}
              <p style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 900, color: "#0f172a" }}>{b.size}</p>
              <p style={{ margin: "0 0 4px", fontSize: 11, color: "#94a3b8" }}>{b.validity ?? "30 days"}</p>
              <p style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 900, color: active.color }}>GH₵{b.price.toFixed(2)}</p>
              <div style={{ background: active.color, color: "white", borderRadius: 12, padding: "10px 0", fontSize: 13, fontWeight: 800, textAlign: "center" }}>Buy Now ⚡</div>
            </button>
          ))}
        </div>
      </div>

      {selected && <CheckoutModal bundle={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
