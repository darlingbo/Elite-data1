"use client";
import { useState, useEffect } from "react";
import { Bundle, Network } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";

const NETS = [
  { id: "mtn" as Network,        label: "MTN",        color: "#f59e0b", text: "#78350f" },
  { id: "telecel" as Network,    label: "Telecel",    color: "#ef4444", text: "#ffffff" },
  { id: "airteltigo" as Network, label: "AirtelTigo", color: "#3b82f6", text: "#ffffff" },
];

const D = { bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e" };

export default function Preview4() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [net, setNet] = useState<Network>("mtn");
  const [selected, setSelected] = useState<Bundle | null>(null);

  useEffect(() => { fetch("/api/bundles").then(r => r.json()).then(d => setBundles(d.bundles ?? [])); }, []);

  const active = NETS.find(n => n.id === net)!;
  const filtered = bundles.filter(b => b.network === net).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const bestId = filtered.length ? filtered.reduce((bst, b) => (b.sizeGB / b.price) > (bst.sizeGB / bst.price) ? b : bst, filtered[0]).id : null;

  return (
    <div style={{ minHeight: "100vh", background: D.bg, fontFamily: "system-ui,sans-serif", color: D.text }}>
      <div style={{ background: "#1e293b", color: "#94a3b8", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "6px 0", letterSpacing: 1 }}>PREVIEW 4 — DARK IMPROVED · <a href="/buy/preview" style={{ color: "#60a5fa" }}>← All options</a></div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 4px" }}>Buy Data Bundles</h1>
          <p style={{ color: D.muted, fontSize: 13, margin: 0 }}>⚡ Instant delivery · Secured by Paystack</p>
        </div>

        {/* Network selector — icon style */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {NETS.map(n => (
            <button key={n.id} onClick={() => setNet(n.id)} style={{ flex: 1, padding: "14px 8px", borderRadius: 16, border: `2px solid ${net === n.id ? n.color : D.border}`, background: net === n.id ? `${n.color}15` : D.card, cursor: "pointer", transition: "all .2s" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: net === n.id ? n.color : `${n.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: net === n.id ? n.text : n.color, margin: "0 auto 6px" }}>{n.label.slice(0,3)}</div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: net === n.id ? n.color : D.muted }}>{n.label}</p>
            </button>
          ))}
        </div>

        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: `${active.color}10`, border: `1px solid ${active.color}30`, borderRadius: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: active.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: active.text }}>{active.label.slice(0,3)}</div>
          <p style={{ margin: 0, fontWeight: 800, color: active.color, fontSize: 14 }}>{active.label} Bundles</p>
        </div>

        {/* Bundle grid — bigger cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {filtered.map(b => (
            <button key={b.id} onClick={() => setSelected(b)} style={{ background: D.card, border: `2px solid ${b.id === bestId ? active.color : D.border}`, borderRadius: 18, padding: 18, cursor: "pointer", textAlign: "left", position: "relative", boxShadow: b.id === bestId ? `0 0 24px ${active.color}20` : "none", transition: "all .15s" }}>
              {b.id === bestId && <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: active.color, color: active.text, fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ Best Value</span>}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: `${active.color}20`, color: active.color }}>{active.label}</span>
                <span style={{ fontSize: 10, color: D.muted }}>{b.validity ?? "30d"}</span>
              </div>

              <p style={{ margin: "0 0 2px", fontSize: 30, fontWeight: 900, color: D.text, lineHeight: 1 }}>{b.size}</p>
              <p style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 900, color: active.color }}>GH₵{b.price.toFixed(2)}</p>

              <div style={{ background: active.color, color: active.text, borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 800, textAlign: "center" }}>
                Buy Now ⚡
              </div>
            </button>
          ))}
        </div>

        {/* Trust */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 24 }}>
          {["⚡ Instant Delivery", "🔒 Paystack Secure", "💬 WhatsApp Support", "✅ All Networks"].map(t => (
            <div key={t} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600, color: D.muted }}>{t}</div>
          ))}
        </div>
      </div>

      {selected && <CheckoutModal bundle={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
