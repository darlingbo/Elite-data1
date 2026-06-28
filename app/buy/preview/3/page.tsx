"use client";
import { useState, useEffect } from "react";
import { Bundle, Network } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";

const NETS = [
  { id: "mtn" as Network,        label: "MTN",        color: "#f59e0b", light: "#fef3c7", dark: "#92400e" },
  { id: "telecel" as Network,    label: "Telecel",    color: "#ef4444", light: "#fee2e2", dark: "#991b1b" },
  { id: "airteltigo" as Network, label: "AirtelTigo", color: "#3b82f6", light: "#dbeafe", dark: "#1e40af" },
];

export default function Preview3() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [net, setNet] = useState<Network>("mtn");
  const [selected, setSelected] = useState<Bundle | null>(null);

  useEffect(() => { fetch("/api/bundles").then(r => r.json()).then(d => setBundles(d.bundles ?? [])); }, []);

  const active = NETS.find(n => n.id === net)!;
  const filtered = bundles.filter(b => b.network === net).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const bestId = filtered.length ? filtered.reduce((bst, b) => (b.sizeGB / b.price) > (bst.sizeGB / bst.price) ? b : bst, filtered[0]).id : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "#1e293b", color: "#94a3b8", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "6px 0", letterSpacing: 1 }}>PREVIEW 3 — LIGHT & CLEAN · <a href="/buy/preview" style={{ color: "#60a5fa" }}>← All options</a></div>

      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: "20px 20px 0" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", margin: "0 0 2px" }}>Buy Data Bundles</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>⚡ Instant delivery · Secured by Paystack</p>

          {/* Network tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0" }}>
            {NETS.map(n => (
              <button key={n.id} onClick={() => setNet(n.id)} style={{ flex: 1, padding: "12px 8px", border: "none", background: "transparent", cursor: "pointer", borderBottom: `3px solid ${net === n.id ? n.color : "transparent"}`, color: net === n.id ? n.dark : "#64748b", fontWeight: 800, fontSize: 14, transition: "all .15s", marginBottom: -2 }}>
                {n.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bundle grid */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {filtered.map(b => (
            <button key={b.id} onClick={() => setSelected(b)} style={{ background: "white", border: `2px solid ${b.id === bestId ? active.color : "#e2e8f0"}`, borderRadius: 18, padding: 18, cursor: "pointer", textAlign: "left", position: "relative", boxShadow: b.id === bestId ? `0 6px 24px ${active.color}25` : "0 2px 6px rgba(0,0,0,0.05)", transition: "transform .15s, box-shadow .15s" }}>
              {b.id === bestId && <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg, ${active.color}, ${active.dark})`, color: "white", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ Best Value</span>}

              <div style={{ display: "inline-block", background: active.light, color: active.dark, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, marginBottom: 10 }}>{active.label}</div>

              <p style={{ margin: "0 0 2px", fontSize: 28, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{b.size}</p>
              <p style={{ margin: "0 0 12px", fontSize: 11, color: "#94a3b8" }}>{b.validity ?? "30 days"}</p>
              <p style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 900, color: active.dark }}>GH₵{b.price.toFixed(2)}</p>

              <div style={{ background: `linear-gradient(135deg, ${active.color}, ${active.dark})`, color: "white", borderRadius: 12, padding: "10px 0", fontSize: 13, fontWeight: 800, textAlign: "center", boxShadow: `0 4px 12px ${active.color}50` }}>
                Buy Now ⚡
              </div>
            </button>
          ))}
        </div>

        {/* Trust row */}
        <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          {["⚡ Instant Delivery", "🔒 Paystack Secure", "💬 WhatsApp Support", "✅ All Networks"].map(t => (
            <span key={t} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 99, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#475569" }}>{t}</span>
          ))}
        </div>
      </div>

      {selected && <CheckoutModal bundle={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
