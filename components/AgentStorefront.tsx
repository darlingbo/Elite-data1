"use client";
import { useState, useEffect } from "react";
import type { Bundle } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";
import VoucherModal from "@/components/VoucherModal";

interface Palette {
  from: string;
  to: string;
  bg: string;
  text: string;
  btn: string;
}

const PALETTES: Palette[] = [
  { from: "#0ea5e9", to: "#2563eb", bg: "#f0f9ff", text: "#0c4a6e", btn: "#0284c7" },
  { from: "#f97316", to: "#dc2626", bg: "#fff7ed", text: "#7c2d12", btn: "#ea580c" },
  { from: "#16a34a", to: "#059669", bg: "#f0fdf4", text: "#14532d", btn: "#15803d" },
  { from: "#7c3aed", to: "#4f46e5", bg: "#f5f3ff", text: "#3b0764", btn: "#6d28d9" },
  { from: "#db2777", to: "#e11d48", bg: "#fff1f2", text: "#881337", btn: "#be185d" },
  { from: "#d97706", to: "#b45309", bg: "#fffbeb", text: "#78350f", btn: "#b45309" },
  { from: "#0d9488", to: "#0891b2", bg: "#f0fdfa", text: "#134e4a", btn: "#0f766e" },
  { from: "#6d28d9", to: "#1d4ed8", bg: "#faf5ff", text: "#2e1065", btn: "#5b21b6" },
];

export function getShopPalette(name: string): Palette {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PALETTES[hash % PALETTES.length];
}

interface MashupBundle {
  id: string; name: string; data_value: number; data_unit: string; minutes: number; price: number;
}

const NETWORKS = [
  { id: "mtn" as const, label: "MTN" },
  { id: "telecel" as const, label: "Telecel" },
  { id: "airteltigo" as const, label: "AirtelTigo" },
  { id: "mashup" as const, label: "Mashup" },
];

interface Props {
  shopName: string;
  agentName: string;
  agentWhatsapp: string;
  agentCode: string;
  isPro?: boolean;
}

const MAIN_WHATSAPP = "233509794503";

export default function AgentStorefront({ shopName, agentWhatsapp, agentCode, isPro }: Props) {
  // Use agent's own WhatsApp if available, otherwise fall back to main site number
  const supportNumber = agentWhatsapp && agentWhatsapp.length > 5 ? agentWhatsapp : MAIN_WHATSAPP;
  const palette = getShopPalette(shopName);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [mashupBundles, setMashupBundles] = useState<MashupBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [network, setNetwork] = useState<"mtn" | "telecel" | "airteltigo" | "mashup">("mtn");
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [netStatus, setNetStatus] = useState<{ mtn: boolean; telecel: boolean; at: boolean; mashup: boolean }>({ mtn: true, telecel: true, at: true, mashup: true });

  useEffect(() => {
    fetch("/api/network-status").then(r => r.json()).then(d => {
      setNetStatus({ mtn: d.mtn !== false, telecel: d.telecel !== false, at: d.at !== false, mashup: d.mashup !== false });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`/api/bundles?agent=${encodeURIComponent(agentCode)}`).then(r => r.json()),
      fetch(`/api/mashup-bundles`).then(r => r.json()),
    ]).then(([d, m]) => {
      setBundles(d.bundles ?? []);
      setMashupBundles(m.bundles ?? []);
      setLoading(false);
    });
  }, [agentCode]);

  const filtered = bundles
    .filter((b) => b.network === network)
    .sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));

  const initial = shopName.charAt(0).toUpperCase();
  const gradStyle = { background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` };

  return (
    <div className="min-h-screen" style={{ background: palette.bg }}>
      {/* Header */}
      <div style={gradStyle}>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center font-black text-white text-xl border border-white/30 shrink-0">
              {initial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white font-black text-xl leading-tight">{shopName}</h1>
                {isPro && (
                  <span className="inline-flex items-center gap-1 bg-amber-400/20 border border-amber-300/40 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full">
                    ⭐ Verified
                  </span>
                )}
              </div>
              <p className="text-white/70 text-sm">Data Bundles · Fast Delivery</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-5 pb-16 space-y-5">

        {/* Network tabs */}
        <div className="flex gap-2 p-1.5 rounded-2xl bg-black/6" style={{ background: "rgba(0,0,0,0.06)" }}>
          {NETWORKS.filter(n => ({ mtn: netStatus.mtn, telecel: netStatus.telecel, airteltigo: netStatus.at, mashup: netStatus.mashup }[n.id] !== false)).map((n) => (
            <button key={n.id} onClick={() => setNetwork(n.id)}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={network === n.id
                ? { ...gradStyle, color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }
                : { color: palette.text, background: "transparent" }}>
              {n.label}
            </button>
          ))}
        </div>

        {/* Bundle grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white/60 rounded-2xl h-32 animate-pulse" />
            ))}
          </div>
        ) : network === "mashup" ? (
          mashupBundles.length === 0 ? (
            <div className="text-center py-12 font-semibold" style={{ color: palette.text }}>
              No Mashup bundles available right now.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mashupBundles.map((b) => {
                const asBundle: Bundle = {
                  id: b.id,
                  network: "mtn",
                  size: b.minutes > 0 ? `${b.data_value}${b.data_unit} + ${b.minutes}min` : `${b.data_value}${b.data_unit}`,
                  sizeGB: b.data_unit === "MB" ? b.data_value / 1024 : b.data_value,
                  price: b.price,
                  costPrice: 0,
                  validity: "30 days",
                };
                return (
                  <button key={b.id} onClick={() => setSelected(asBundle)}
                    className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition-all border border-transparent hover:border-white/80">
                    <div className="text-xs font-black mb-2 px-2 py-0.5 rounded-full inline-block text-white"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                      Mashup
                    </div>
                    <p className="font-black text-gray-800 text-sm leading-snug mb-0.5">{b.name}</p>
                    {b.minutes > 0 && <p className="text-xs text-purple-600 font-semibold mb-0.5">📞 {b.minutes} mins</p>}
                    <p className="font-black text-xl" style={{ color: palette.btn }}>GH₵{b.price.toFixed(2)}</p>
                    <div className="mt-3 w-full py-1.5 rounded-xl text-xs font-bold text-white text-center"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                      Buy Now
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 font-semibold" style={{ color: palette.text }}>
            No bundles available for this network right now.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((b) => (
              <button key={b.id} onClick={() => setSelected(b)}
                className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition-all border border-transparent hover:border-white/80 group">
                <div className="text-xs font-black mb-2 px-2 py-0.5 rounded-full inline-block text-white"
                  style={gradStyle}>
                  {b.network === "airteltigo" ? "AT" : b.network.toUpperCase()}
                </div>
                <p className="font-black text-gray-800 text-lg leading-none mb-0.5">{b.size}</p>
                <p className="font-black text-xl" style={{ color: palette.btn }}>GH₵{b.price.toFixed(2)}</p>
                <div className="mt-3 w-full py-1.5 rounded-xl text-xs font-bold text-white text-center" style={gradStyle}>
                  Buy Now
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Voucher card */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: palette.text, opacity: 0.7 }}>
            Result Checker
          </p>
          <button onClick={() => setVoucherOpen(true)}
            className="w-full bg-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-all border border-transparent hover:border-white/80">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg z-10 border-2 border-white">📗</div>
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg border-2 border-white">📘</div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-800 text-sm">BECE &amp; WASSCE Voucher</p>
                <p className="text-xs text-gray-400">GH₵18 each · Sent via SMS instantly</p>
              </div>
              <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        {/* WhatsApp support — shows agent's own number, falls back to main site number */}
        <a href={`https://wa.me/${supportNumber}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-3 bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition-all">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-sm">WhatsApp Support</p>
            <p className="text-xs text-gray-400">+{supportNumber}</p>
          </div>
          <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full shrink-0">Online</span>
        </a>

        {/* Trust strip */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: "⚡", text: "Instant Delivery" },
            { icon: "🔒", text: "Secure Payment" },
          ].map((item) => (
            <div key={item.text} className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs font-semibold text-gray-600">{item.text}</span>
            </div>
          ))}
        </div>

        {/* Info note */}
        <p className="text-center text-xs text-gray-400">
          All bundles are delivered within 1–5 minutes after payment.
        </p>
      </div>

      {selected && (
        <CheckoutModal bundle={selected} agentCode={agentCode} onClose={() => setSelected(null)} />
      )}
      {voucherOpen && (
        <VoucherModal agentCode={agentCode} onClose={() => setVoucherOpen(false)} />
      )}
    </div>
  );
}
