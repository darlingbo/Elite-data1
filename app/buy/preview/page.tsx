"use client";
import Link from "next/link";

export default function BuyPreviewIndex() {
  const options = [
    { num: 1, label: "Bold Network Hero",      desc: "Big colored network tabs at top, bundles below",      color: "#f59e0b", path: "/buy/preview/1" },
    { num: 2, label: "Swipe / Single Column",  desc: "Full-width cards, one per row, best value featured",   color: "#3b82f6", path: "/buy/preview/2" },
    { num: 3, label: "Light & Clean",          desc: "White background, colorful, modern feel",              color: "#10b981", path: "/buy/preview/3" },
    { num: 4, label: "Dark — Improved",        desc: "Same dark theme but bigger cards, better spacing",     color: "#8b5cf6", path: "/buy/preview/4" },
  ];
  return (
    <div style={{ minHeight: "100vh", background: "#060c1c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <h1 style={{ color: "#f8fafc", fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>Buy Page — Design Options</h1>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>Tap each to preview on the live site</p>
      {options.map(o => (
        <Link key={o.num} href={o.path} style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", maxWidth: 380, background: "#0d1b2e", border: `1px solid ${o.color}40`, borderRadius: 16, padding: "16px 20px", textDecoration: "none" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${o.color}20`, border: `2px solid ${o.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: o.color, flexShrink: 0 }}>{o.num}</div>
          <div>
            <p style={{ color: "#f8fafc", fontWeight: 800, fontSize: 15, margin: "0 0 2px" }}>{o.label}</p>
            <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>{o.desc}</p>
          </div>
          <span style={{ color: o.color, fontSize: 18, marginLeft: "auto" }}>→</span>
        </Link>
      ))}
    </div>
  );
}
