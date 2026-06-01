"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { type Network } from "@/lib/bundles";

type BundleItem = { id: string; network: Network; size: string; sizeGB: number; validity: string; price: number; popular?: boolean };

const NETS: { id: Network; label: string; color: string; textOnColor: string; activeBg: string; lightBg: string }[] = [
  { id: "mtn",        label: "MTN",        color: "#f59e0b", textOnColor: "#78350f", activeBg: "#f59e0b", lightBg: "#fffbeb" },
  { id: "telecel",    label: "Telecel",    color: "#ef4444", textOnColor: "#ffffff", activeBg: "#ef4444", lightBg: "#fff5f5" },
  { id: "airteltigo", label: "AirtelTigo", color: "#3b82f6", textOnColor: "#ffffff", activeBg: "#3b82f6", lightBg: "#eff6ff" },
];

export default function PopularBundlesSection() {
  const [activeNet, setActiveNet] = useState<Network>("mtn");
  const [allBundles, setAllBundles] = useState<BundleItem[]>([]);

  useEffect(() => {
    fetch("/api/bundles")
      .then(r => r.json())
      .then(d => setAllBundles(d.bundles ?? []))
      .catch(() => {});
  }, []);

  const net = NETS.find(n => n.id === activeNet)!;
  const popular = allBundles.filter(b => b.network === activeNet && b.popular);
  const all = allBundles.filter(b => b.network === activeNet);
  const shown = popular.length >= 3 ? popular : all.slice(0, 6);

  return (
    <section className="py-16 px-4 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">
            Live Prices
          </span>
          <h2 className="text-3xl font-black text-gray-800 mb-2">Popular Bundles</h2>
          <p className="text-gray-500">Our most-bought bundles — great value for every need</p>
        </div>

        {/* Network tabs */}
        <div className="flex justify-center gap-2 mb-8 flex-wrap">
          {NETS.map(n => (
            <button key={n.id} onClick={() => setActiveNet(n.id)}
              style={{
                background: activeNet === n.id ? n.activeBg : "white",
                color: activeNet === n.id ? n.textOnColor : "#6b7280",
                border: `2px solid ${activeNet === n.id ? n.activeBg : "#e5e7eb"}`,
                boxShadow: activeNet === n.id ? `0 4px 14px ${n.color}44` : "none",
              }}
              className="px-6 py-2.5 rounded-full font-bold text-sm transition-all">
              {n.label}
            </button>
          ))}
        </div>

        {/* Bundle cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {shown.map(b => (
            <Link key={b.id} href={`/buy?network=${b.network}`}
              style={{ borderColor: net.color + "55", background: net.lightBg }}
              className="rounded-2xl border-2 p-5 flex flex-col hover:shadow-lg transition-all hover:-translate-y-1 group">

              {b.popular && (
                <span style={{ background: net.color + "22", color: net.color }}
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full self-start mb-3">
                  Most Popular ⭐
                </span>
              )}

              <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: net.color }}>{net.label}</p>
              <p className="text-3xl font-black text-gray-800 mb-1">{b.size}</p>
              <p className="font-bold text-lg mb-1" style={{ color: net.color }}>GH₵{Number(b.price).toFixed(2)}</p>
              <p className="text-xs text-gray-400 mb-4">{b.validity}</p>

              <div style={{ background: net.color, color: net.textOnColor }}
                className="mt-auto text-center text-sm font-bold py-2.5 rounded-xl group-hover:opacity-90 transition-opacity">
                Buy Now →
              </div>
            </Link>
          ))}
        </div>

        {/* See all link */}
        <div className="text-center mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/prices"
            className="inline-flex items-center gap-2 bg-white border-2 border-gray-200 hover:border-blue-400 text-gray-700 hover:text-blue-600 font-bold px-6 py-3 rounded-xl transition-all text-sm">
            See all {net.label} prices →
          </Link>
          <Link href="/buy"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-lg shadow-blue-200">
            Buy Data Now ⚡
          </Link>
        </div>
      </div>
    </section>
  );
}
