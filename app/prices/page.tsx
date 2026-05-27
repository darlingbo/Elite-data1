"use client";
import { useState } from "react";
import Link from "next/link";
import { bundles, type Network } from "@/lib/bundles";

const NETS: { id: Network; label: string; color: string; textOnColor: string; bg: string; border: string; lightBg: string }[] = [
  { id: "mtn",        label: "MTN",        color: "#f59e0b", textOnColor: "#78350f", bg: "#fef3c7", border: "#fcd34d", lightBg: "#fffbeb" },
  { id: "telecel",    label: "Telecel",    color: "#ef4444", textOnColor: "#ffffff", bg: "#fee2e2", border: "#fca5a5", lightBg: "#fff5f5" },
  { id: "airteltigo", label: "AirtelTigo", color: "#3b82f6", textOnColor: "#ffffff", bg: "#dbeafe", border: "#93c5fd", lightBg: "#eff6ff" },
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

function bestValue(netBundles: typeof bundles) {
  let best = netBundles[0];
  for (const b of netBundles) {
    if (b.price / b.sizeGB < best.price / best.sizeGB) best = b;
  }
  return best.id;
}

export default function PricesPage() {
  const [activeNet, setActiveNet] = useState<Network>("mtn");
  const [usageHours, setUsageHours] = useState<Record<string, number>>({
    whatsapp: 0, social: 0, youtube: 0, netflix: 0, browsing: 0, zoom: 0,
  });
  const [calcNet, setCalcNet] = useState<Network>("mtn");

  const net = NETS.find(n => n.id === activeNet)!;
  const shown = bundles.filter(b => b.network === activeNet);
  const bestValueId = bestValue(shown);

  const totalGB = USAGE.reduce((sum, u) => sum + u.gbPerHour * (usageHours[u.id] ?? 0) * 30, 0);
  const calcBundles = bundles.filter(b => b.network === calcNet && b.sizeGB >= totalGB).sort((a, b) => a.price - b.price);
  const recommended = calcBundles[0] ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
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
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0">
            {NETS.map(n => (
              <button key={n.id} onClick={() => setActiveNet(n.id)}
                className="flex-1 py-4 text-sm font-bold transition-all relative"
                style={{
                  color: activeNet === n.id ? n.color : "#6b7280",
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {shown.map(b => {
            const isBest = b.id === bestValueId;
            const isPopular = b.popular;
            return (
              <div key={b.id} style={{ borderColor: isBest ? net.color : "#e5e7eb", background: isBest ? net.lightBg : "white" }}
                className={`rounded-2xl border-2 p-4 flex flex-col relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${isBest ? "shadow-md" : ""}`}>

                {/* Badges */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {isBest && (
                    <span style={{ background: net.color, color: net.textOnColor }} className="text-xs font-bold px-2 py-0.5 rounded-full">
                      Best Value ★
                    </span>
                  )}
                  {isPopular && !isBest && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      Popular
                    </span>
                  )}
                </div>

                {/* Network label */}
                <span style={{ color: net.color }} className="text-xs font-bold mb-1 uppercase tracking-wide">{net.label}</span>

                {/* Size */}
                <p className="text-2xl font-black text-gray-800 mb-1">{b.size}</p>

                {/* Price */}
                <p style={{ color: net.color }} className="text-xl font-bold mb-1">GH₵{Number(b.price).toFixed(2)}</p>

                {/* Per GB */}
                <p className="text-xs text-gray-400 mb-1">GH₵{valuePerGB(b.price, b.sizeGB)}/GB</p>

                {/* Validity */}
                <p className="text-xs text-gray-400 mb-4">{b.validity}</p>

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
          <h2 className="text-2xl font-black text-gray-800 mb-2 text-center">Price Comparison</h2>
          <p className="text-gray-500 text-center mb-6 text-sm">Same data size, different networks — see who's cheaper</p>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Size</th>
                    {NETS.map(n => (
                      <th key={n.id} className="px-5 py-3.5 text-center text-xs font-bold uppercase tracking-wider" style={{ color: n.color }}>{n.label}</th>
                    ))}
                    <th className="px-5 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Cheapest</th>
                  </tr>
                </thead>
                <tbody>
                  {[0.5, 1, 2, 5, 10, 20, 50].map((gb, i) => {
                    const row = NETS.map(n => bundles.find(b => b.network === n.id && b.sizeGB === gb));
                    const prices = row.map(b => b?.price ?? Infinity);
                    const minPrice = Math.min(...prices);
                    const cheapestNet = NETS[prices.indexOf(minPrice)];
                    const label = gb < 1 ? `${gb * 1000}MB` : `${gb}GB`;
                    if (row.every(b => !b)) return null;
                    return (
                      <tr key={gb} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                        <td className="px-5 py-4 font-bold text-gray-800">{label}</td>
                        {NETS.map((n, ni) => {
                          const b = row[ni];
                          const isCheapest = b && b.price === minPrice;
                          return (
                            <td key={n.id} className="px-5 py-4 text-center">
                              {b ? (
                                <span style={{ color: isCheapest ? n.color : "#374151", fontWeight: isCheapest ? 800 : 500 }}
                                  className="text-sm">
                                  GH₵{Number(b.price).toFixed(2)}
                                  {isCheapest && <span className="ml-1 text-xs">★</span>}
                                </span>
                              ) : <span className="text-gray-300 text-sm">—</span>}
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
        <div className="mt-14 bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <div className="text-center mb-8">
            <span className="text-3xl">🧮</span>
            <h2 className="text-2xl font-black text-gray-800 mt-2 mb-1">Data Usage Calculator</h2>
            <p className="text-gray-500 text-sm">Tell us how you use data — we'll find the right bundle</p>
          </div>

          {/* Usage sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 mb-8">
            {USAGE.map(u => (
              <div key={u.id} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">{u.icon} {u.label}</span>
                  <span className="text-sm font-bold text-blue-600">
                    {usageHours[u.id]}h/day
                  </span>
                </div>
                <input type="range" min={0} max={8} step={0.5}
                  value={usageHours[u.id]}
                  onChange={e => setUsageHours(h => ({ ...h, [u.id]: parseFloat(e.target.value) }))}
                  className="w-full accent-blue-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0h</span><span>8h</span>
                </div>
              </div>
            ))}
          </div>

          {/* Network picker for recommendation */}
          <div className="flex justify-center gap-3 mb-6">
            <p className="text-sm font-semibold text-gray-600 self-center">Your network:</p>
            {NETS.map(n => (
              <button key={n.id} onClick={() => setCalcNet(n.id)}
                style={{
                  background: calcNet === n.id ? n.color : "transparent",
                  color: calcNet === n.id ? n.textOnColor : "#6b7280",
                  border: `2px solid ${calcNet === n.id ? n.color : "#e5e7eb"}`,
                }}
                className="px-4 py-1.5 rounded-full text-sm font-bold transition-all">
                {n.label}
              </button>
            ))}
          </div>

          {/* Result */}
          {totalGB === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-sm">Move the sliders above to see your recommendation</p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center">
              <p className="text-sm text-gray-600 mb-1">Your estimated monthly data usage</p>
              <p className="text-4xl font-black text-blue-700 mb-1">{totalGB.toFixed(1)} GB</p>
              <p className="text-sm text-gray-500 mb-5">per month</p>
              {recommended ? (
                <>
                  <p className="text-sm font-semibold text-gray-600 mb-3">Recommended bundle for you:</p>
                  <div className="inline-flex flex-col items-center gap-3">
                    {(() => {
                      const rNet = NETS.find(n => n.id === calcNet)!;
                      return (
                        <>
                          <div style={{ borderColor: rNet.color, background: rNet.lightBg }}
                            className="border-2 rounded-xl px-8 py-4 text-center">
                            <p style={{ color: rNet.color }} className="text-xs font-bold uppercase tracking-wide mb-1">{rNet.label}</p>
                            <p className="text-3xl font-black text-gray-800">{recommended.size}</p>
                            <p style={{ color: rNet.color }} className="text-xl font-bold">GH₵{Number(recommended.price).toFixed(2)}</p>
                            <p className="text-xs text-gray-400 mt-1">{recommended.validity}</p>
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
                <p className="text-sm text-gray-500">No single bundle covers this usage. Consider our largest bundle or contact us on WhatsApp for custom options.</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 mb-4">Ready to buy?</p>
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
