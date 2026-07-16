"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { type Network } from "@/lib/bundles";

const BG = "#080f1e";
const CARD = "#0d1b2e";
const BORDER = "#1e3a5f";
const TEXT = "#f8fafc";
const MUTED = "#94a3b8";
const SUB = "#64748b";

type BundleItem = { id: string; network: Network; size: string; sizeGB: number; validity: string; price: number; costPrice: number; popular?: boolean };

const NETS: { id: Network; label: string; color: string; textOnColor: string; lightBg: string }[] = [
  { id: "mtn",        label: "MTN",        color: "#f59e0b", textOnColor: "#78350f", lightBg: "rgba(245,158,11,0.10)" },
  { id: "telecel",    label: "Telecel",    color: "#ef4444", textOnColor: "#ffffff", lightBg: "rgba(239,68,68,0.10)" },
  { id: "airteltigo", label: "AirtelTigo", color: "#3b82f6", textOnColor: "#ffffff", lightBg: "rgba(59,130,246,0.10)" },
];

const USAGE = [
  { id: "whatsapp",  label: "WhatsApp",  icon: "💬", gbPerHour: 0.03 },
  { id: "social",    label: "Social Media", icon: "📱", gbPerHour: 0.15 },
  { id: "youtube",   label: "YouTube",   icon: "▶️", gbPerHour: 0.7 },
  { id: "netflix",   label: "Netflix",   icon: "🎬", gbPerHour: 1.5 },
  { id: "browsing",  label: "Browsing",  icon: "🌐", gbPerHour: 0.05 },
  { id: "zoom",      label: "Video Calls",icon: "📹", gbPerHour: 0.5 },
];

function valuePerGB(price: number, sizeGB: number) {
  return (price / sizeGB).toFixed(2);
}

function bestValue(netBundles: BundleItem[]) {
  if (!netBundles.length) return "";
  let best = netBundles[0];
  for (const b of netBundles) {
    if (b.price / b.sizeGB < best.price / best.sizeGB) best = b;
  }
  return best.id;
}

export default function PricesPage() {
  const [activeNet, setActiveNet] = useState<Network>("mtn");
  const [allBundles, setAllBundles] = useState<BundleItem[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [usageHours, setUsageHours] = useState<Record<string, number>>({
    whatsapp: 0, social: 0, youtube: 0, netflix: 0, browsing: 0, zoom: 0,
  });
  const [calcNet, setCalcNet] = useState<Network>("mtn");

  useEffect(() => {
    fetch("/api/bundles")
      .then(r => r.json())
      .then(d => { setAllBundles(d.bundles ?? []); setLoadingBundles(false); })
      .catch(() => setLoadingBundles(false));
  }, []);

  const net = NETS.find(n => n.id === activeNet)!;
  const shown = allBundles.filter(b => b.network === activeNet);
  const bestValueId = bestValue(shown);

  const totalGB = USAGE.reduce((sum, u) => sum + u.gbPerHour * (usageHours[u.id] ?? 0) * 30, 0);
  const calcBundles = allBundles.filter(b => b.network === calcNet && b.sizeGB >= totalGB).sort((a, b) => a.price - b.price);
  const recommended = calcBundles[0] ?? null;

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 text-white py-14 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider border border-white/30">
            Live Prices
          </span>
          <h1 className="text-4xl md:text-5xl font-black mb-3">Bundle Prices</h1>
          <p className="text-blue-100 text-lg mb-6">All available data bundles across every network — tap any to buy instantly.</p>
          <Link href="/buy" className="inline-block bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg">
            Buy Data Now ⚡
          </Link>
        </div>
      </div>

      {/* Network tabs */}
      <div className="sticky top-0 z-20" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0">
            {NETS.map(n => (
              <button key={n.id} onClick={() => setActiveNet(n.id)}
                className="flex-1 py-4 text-sm font-bold transition-all relative"
                style={{
                  color: activeNet === n.id ? n.color : MUTED,
                  borderBottom: activeNet === n.id ? `3px solid ${n.color}` : "3px solid transparent",
                }}>
                {n.label}
                {activeNet === n.id && (
                  <span className="ml-1.5 text-xs font-semibold opacity-70">({shown.length} bundles)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bundle grid */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        {loadingBundles && (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {shown.map(b => {
            const isBest = b.id === bestValueId;
            const isPopular = b.popular;
            return (
              <div key={b.id}
                style={{ borderColor: isBest ? net.color : BORDER, background: isBest ? net.lightBg : CARD }}
                className={`rounded-2xl border-2 p-4 flex flex-col relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${isBest ? "shadow-md" : ""}`}>

                {/* Badges */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {isBest && (
                    <span style={{ background: net.color, color: net.textOnColor }} className="text-xs font-bold px-2 py-0.5 rounded-full">
                      Best Value ★
                    </span>
                  )}
                  {isPopular && !isBest && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      Popular
                    </span>
                  )}
                </div>

                {/* Network label */}
                <span style={{ color: net.color }} className="text-xs font-bold mb-1 uppercase tracking-wide">{net.label}</span>

                {/* Size */}
                <p className="text-2xl font-black mb-1" style={{ color: TEXT }}>{b.size}</p>

                {/* Price */}
                <p style={{ color: net.color }} className="text-xl font-bold mb-1">GH₵{Number(b.price).toFixed(2)}</p>

                {/* Per GB */}
                <p className="text-xs mb-1" style={{ color: MUTED }}>GH₵{valuePerGB(b.price, b.sizeGB)}/GB</p>

                {/* Validity */}
                <p className="text-xs mb-4" style={{ color: MUTED }}>{b.validity}</p>

                {/* Buy button */}
                <Link href={`/buy?network=${b.network}`}
                  style={{ background: net.color, color: net.textOnColor }}
                  className="mt-auto text-center text-sm font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity">
                  Buy Now →
                </Link>
              </div>
            );
          })}
        </div>

        {/* Price comparison across networks */}
        <div className="mt-14">
          <h2 className="text-2xl font-black mb-2 text-center" style={{ color: TEXT }}>Price Comparison</h2>
          <p className="text-center mb-6 text-sm" style={{ color: MUTED }}>Same data size, different networks — see who&apos;s cheaper</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                    <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Size</th>
                    {NETS.map(n => (
                      <th key={n.id} className="px-5 py-3.5 text-center text-xs font-bold uppercase tracking-wider" style={{ color: n.color }}>{n.label}</th>
                    ))}
                    <th className="px-5 py-3.5 text-center text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>Cheapest</th>
                  </tr>
                </thead>
                <tbody>
                  {[0.5, 1, 2, 5, 10, 20, 50].map((gb, i) => {
                    const row = NETS.map(n => allBundles.find(b => b.network === n.id && b.sizeGB === gb));
                    const prices = row.map(b => b?.price ?? Infinity);
                    const minPrice = Math.min(...prices);
                    const cheapestNet = NETS[prices.indexOf(minPrice)];
                    const label = gb < 1 ? `${gb * 1000}MB` : `${gb}GB`;
                    if (row.every(b => !b)) return null;
                    return (
                      <tr key={gb} style={{ background: i % 2 === 0 ? CARD : "rgba(255,255,255,0.02)" }}>
                        <td className="px-5 py-4 font-bold" style={{ color: TEXT }}>{label}</td>
                        {NETS.map((n, ni) => {
                          const b = row[ni];
                          const isCheapest = b && b.price === minPrice;
                          return (
                            <td key={n.id} className="px-5 py-4 text-center">
                              {b ? (
                                <span style={{ color: isCheapest ? n.color : MUTED, fontWeight: isCheapest ? 800 : 500 }}
                                  className="text-sm">
                                  GH₵{Number(b.price).toFixed(2)}
                                  {isCheapest && <span className="ml-1 text-xs">★</span>}
                                </span>
                              ) : <span className="text-sm" style={{ color: SUB }}>—</span>}
                            </td>
                          );
                        })}
                        <td className="px-5 py-4 text-center">
                          {cheapestNet && (
                            <span style={{ background: cheapestNet.color + "22", color: cheapestNet.color }}
                              className="text-xs font-bold px-2.5 py-1 rounded-full">{cheapestNet.label}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Data Usage Calculator */}
        <div className="mt-14 rounded-2xl p-8" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="text-center mb-8">
            <span className="text-3xl">🧮</span>
            <h2 className="text-2xl font-black mt-2 mb-1" style={{ color: TEXT }}>Data Usage Calculator</h2>
            <p className="text-sm" style={{ color: MUTED }}>Tell us how you use data — we&apos;ll find the right bundle</p>
          </div>

          {/* Usage sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 mb-8">
            {USAGE.map(u => (
              <div key={u.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: TEXT }}>{u.icon} {u.label}</span>
                  <span className="text-sm font-bold text-blue-400">
                    {usageHours[u.id]}h/day
                  </span>
                </div>
                <input type="range" min={0} max={8} step={0.5}
                  value={usageHours[u.id]}
                  onChange={e => setUsageHours(h => ({ ...h, [u.id]: parseFloat(e.target.value) }))}
                  className="w-full accent-blue-500" />
                <div className="flex justify-between text-xs mt-1" style={{ color: SUB }}>
                  <span>0h</span><span>8h</span>
                </div>
              </div>
            ))}
          </div>

          {/* Network picker for recommendation */}
          <div className="flex justify-center gap-3 mb-6">
            <p className="text-sm font-semibold self-center" style={{ color: MUTED }}>Your network:</p>
            {NETS.map(n => (
              <button key={n.id} onClick={() => setCalcNet(n.id)}
                style={{
                  background: calcNet === n.id ? n.color : "transparent",
                  color: calcNet === n.id ? n.textOnColor : MUTED,
                  border: `2px solid ${calcNet === n.id ? n.color : BORDER}`,
                }}
                className="px-4 py-1.5 rounded-full text-sm font-bold transition-all">
                {n.label}
              </button>
            ))}
          </div>

          {/* Result */}
          {totalGB === 0 ? (
            <div className="text-center py-6" style={{ color: MUTED }}>
              <p className="text-sm">Move the sliders above to see your recommendation</p>
            </div>
          ) : (
            <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <p className="text-sm mb-1" style={{ color: MUTED }}>Your estimated monthly data usage</p>
              <p className="text-4xl font-black mb-1 text-blue-400">{totalGB.toFixed(1)} GB</p>
              <p className="text-sm mb-5" style={{ color: MUTED }}>per month</p>
              {recommended ? (
                <>
                  <p className="text-sm font-semibold mb-3" style={{ color: MUTED }}>Recommended bundle for you:</p>
                  <div className="inline-flex flex-col items-center gap-3">
                    {(() => {
                      const rNet = NETS.find(n => n.id === calcNet)!;
                      return (
                        <>
                          <div style={{ borderColor: rNet.color, background: rNet.lightBg, border: `2px solid ${rNet.color}` }}
                            className="rounded-xl px-8 py-4 text-center">
                            <p style={{ color: rNet.color }} className="text-xs font-bold uppercase tracking-wide mb-1">{rNet.label}</p>
                            <p className="text-3xl font-black" style={{ color: TEXT }}>{recommended.size}</p>
                            <p style={{ color: rNet.color }} className="text-xl font-bold">GH₵{Number(recommended.price).toFixed(2)}</p>
                            <p className="text-xs mt-1" style={{ color: MUTED }}>{recommended.validity}</p>
                          </div>
                          <Link href={`/buy?network=${recommended.network}`}
                            style={{ background: rNet.color, color: rNet.textOnColor }}
                            className="font-black px-8 py-3 rounded-xl text-sm transition-opacity hover:opacity-90">
                            Buy This Bundle →
                          </Link>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color: MUTED }}>No single bundle covers this usage. Consider our largest bundle or contact us on WhatsApp for custom options.</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="mb-4" style={{ color: MUTED }}>Ready to buy?</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/buy" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-3.5 rounded-xl transition-colors shadow-lg">
              Buy Data Now ⚡
            </Link>
            <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
              className="bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-3.5 rounded-xl transition-colors">
              WhatsApp Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
