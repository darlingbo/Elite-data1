"use client";
import { useState, useEffect } from "react";
import type { Bundle } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";
import VoucherModal from "@/components/VoucherModal";
import type { AgentSession } from "@/app/shop/[code]/page";

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

const NETWORKS = [
  { id: "mtn" as const, label: "MTN" },
  { id: "telecel" as const, label: "Telecel" },
  { id: "airteltigo" as const, label: "AirtelTigo" },
];

interface Props {
  shopName: string;
  agentName: string;
  agentWhatsapp: string;
  agentCode: string;
  agentSession?: AgentSession | null;
  onAgentLoginRequest?: () => void;
  onAgentLogout?: () => void;
  onWalletBalanceChange?: (newBalance: number) => void;
}

const MAIN_WHATSAPP = "233509794503";

export default function AgentStorefront({
  shopName,
  agentWhatsapp,
  agentCode,
  agentSession,
  onAgentLoginRequest,
  onAgentLogout,
  onWalletBalanceChange,
}: Props) {
  const supportNumber = agentWhatsapp && agentWhatsapp.length > 5 ? agentWhatsapp : MAIN_WHATSAPP;
  const palette = getShopPalette(shopName);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [network, setNetwork] = useState<"mtn" | "telecel" | "airteltigo">("mtn");
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [walletSelected, setWalletSelected] = useState<{ bundle: Bundle; tierPrice: number } | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);

  // Is this agent viewing their own shop?
  const isOwnShop = !!agentSession && agentSession.referralCode === agentCode;

  useEffect(() => {
    Promise.all([
      fetch(`/api/bundles?agent=${encodeURIComponent(agentCode)}`).then(r => r.json()),
      fetch(`/api/agent-tier-prices?agentCode=${encodeURIComponent(agentCode)}`).then(r => r.json()),
    ]).then(([bd, td]) => {
      setBundles(bd.bundles ?? []);
      const tm: Record<string, number> = {};
      for (const p of (td.prices ?? [])) tm[p.bundle_id] = Number(p.price);
      setTierPrices(tm);
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
            <div className="flex-1">
              <h1 className="text-white font-black text-xl leading-tight">{shopName}</h1>
              <p className="text-white/70 text-sm">Data Bundles · Fast Delivery</p>
            </div>
            {/* Agent login/logout button */}
            {isOwnShop ? (
              <button
                onClick={onAgentLogout}
                style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 10, color: "white", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Agent ✓
              </button>
            ) : (
              <button
                onClick={onAgentLoginRequest}
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, color: "white", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Agent Login
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Wallet balance bar for own-shop agents */}
      {isOwnShop && agentSession && (
        <div style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0" }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <p style={{ color: "#16a34a", fontWeight: 900, fontSize: 16, margin: 0 }}>
                Wallet: GH₵{agentSession.walletBalance.toFixed(2)}
              </p>
              <p style={{ color: "#4ade80", fontSize: 11, margin: 0 }}>Tap a bundle to pay instantly from wallet</p>
            </div>
            <span style={{ background: "#dcfce7", color: "#15803d", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>Agent Mode</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-5 pb-16 space-y-5">

        {/* Network tabs */}
        <div className="flex gap-2 p-1.5 rounded-2xl bg-black/6" style={{ background: "rgba(0,0,0,0.06)" }}>
          {NETWORKS.map((n) => (
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 font-semibold" style={{ color: palette.text }}>
            No bundles available for this network right now.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((b) => (
              <button key={b.id}
                onClick={() => {
                  if (isOwnShop) {
                    const tp = tierPrices[b.id] ?? b.costPrice;
                    setWalletSelected({ bundle: b, tierPrice: tp });
                  } else {
                    setSelected(b);
                  }
                }}
                className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition-all border border-transparent hover:border-white/80 group">
                <div className="text-xs font-black mb-2 px-2 py-0.5 rounded-full inline-block text-white"
                  style={gradStyle}>
                  {b.network === "airteltigo" ? "AT" : b.network.toUpperCase()}
                </div>
                <p className="font-black text-gray-800 text-lg leading-none mb-0.5">{b.size}</p>
                <p className="font-black text-xl" style={{ color: palette.btn }}>
                  GH₵{isOwnShop ? (tierPrices[b.id] ?? b.costPrice).toFixed(2) : b.price.toFixed(2)}
                </p>
                <div className="mt-3 w-full py-1.5 rounded-xl text-xs font-bold text-white text-center" style={gradStyle}>
                  {isOwnShop ? "⚡ Pay with Wallet" : "Buy Now"}
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

        {/* WhatsApp support */}
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

        <p className="text-center text-xs text-gray-400">
          All bundles are delivered within 1–5 minutes after payment.
        </p>
      </div>

      {/* Paystack checkout (non-agent customers) */}
      {selected && (
        <CheckoutModal bundle={selected} agentCode={agentCode} onClose={() => setSelected(null)} />
      )}

      {/* Wallet checkout (own-shop agent mode) */}
      {walletSelected && agentSession && (
        <WalletCheckoutModal
          bundle={walletSelected.bundle}
          tierPrice={walletSelected.tierPrice}
          agentSession={agentSession}
          palette={palette}
          onClose={() => setWalletSelected(null)}
          onSuccess={(newBalance) => {
            setWalletSelected(null);
            onWalletBalanceChange?.(newBalance);
          }}
        />
      )}

      {voucherOpen && (
        <VoucherModal agentCode={agentCode} onClose={() => setVoucherOpen(false)} />
      )}
    </div>
  );
}

// ─── Wallet Checkout Modal ────────────────────────────────────────────────────
function WalletCheckoutModal({
  bundle,
  tierPrice,
  agentSession,
  palette,
  onClose,
  onSuccess,
}: {
  bundle: Bundle;
  tierPrice: number;
  agentSession: AgentSession;
  palette: Palette;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ phone: string; pending?: boolean } | null>(null);
  const gradStyle = { background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` };

  async function pay() {
    const cleaned = phone.replace(/\s/g, "");
    if (!/^0[2-5][0-9]{8}$/.test(cleaned)) { setError("Enter a valid Ghana phone number (e.g. 0241234567)."); return; }
    if (agentSession.walletBalance < tierPrice) {
      setError(`Insufficient wallet balance. Need GH₵${tierPrice.toFixed(2)}, you have GH₵${agentSession.walletBalance.toFixed(2)}.`);
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/agents/wallet-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentSession.id,
          referralCode: agentSession.referralCode,
          phone: cleaned,
          bundleId: bundle.id,
          network: bundle.network,
          bundleSize: bundle.size,
          sizeGB: bundle.sizeGB,
        }),
      });
      const d = await res.json();
      if (d.success) {
        onSuccess(d.newWalletBalance ?? agentSession.walletBalance - tierPrice);
        setSuccess({ phone: cleaned, pending: d.pending });
      } else {
        setError(d.error ?? "Payment failed. Try again.");
      }
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 env(safe-area-inset-bottom)" }}>
      <div style={{ background: "white", borderRadius: "24px 24px 0 0", padding: "24px 24px 32px", width: "100%", maxWidth: 480, boxShadow: "0 -10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontWeight: 900, fontSize: 18, color: "#1e293b", margin: 0 }}>Wallet Checkout</p>
            <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>Agent Mode — Instant Delivery</p>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 18, cursor: "pointer", color: "#64748b" }}>✕</button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: 48, margin: "0 0 12px" }}>{success.pending ? "⏳" : "✅"}</p>
            <p style={{ fontWeight: 900, fontSize: 18, color: "#1e293b", margin: "0 0 6px" }}>
              {success.pending ? "Order Sent!" : "Data Delivered!"}
            </p>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 4px" }}>
              {bundle.network.toUpperCase()} {bundle.size} → {success.phone}
            </p>
            {success.pending && <p style={{ color: "#92400e", fontSize: 12, margin: "6px 0 0" }}>Delivery in 1–5 minutes</p>}
            <button onClick={onClose} style={{ marginTop: 20, ...gradStyle, color: "white", border: "none", borderRadius: 12, padding: "12px 32px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <>
            {/* Bundle summary */}
            <div style={{ background: "#f8fafc", borderRadius: 14, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 900, fontSize: 17, color: "#1e293b", margin: 0 }}>{bundle.size} — {bundle.network.toUpperCase()}</p>
                <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>{bundle.validity}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontWeight: 900, fontSize: 18, color: palette.btn, margin: 0 }}>GH₵{tierPrice.toFixed(2)}</p>
                <p style={{ color: "#94a3b8", fontSize: 11, margin: 0 }}>from wallet</p>
              </div>
            </div>

            {/* Wallet balance */}
            <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>Wallet Balance</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#16a34a" }}>GH₵{agentSession.walletBalance.toFixed(2)}</span>
            </div>

            <p style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" }}>Recipient Phone Number</p>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0241234567"
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", fontSize: 16, fontWeight: 700, width: "100%", outline: "none", color: "#1e293b", boxSizing: "border-box", marginBottom: 14 }}
            />
            {error && <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>{error}</p>}
            <button
              onClick={pay}
              disabled={loading}
              style={{ width: "100%", ...gradStyle, color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 900, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Processing…" : `⚡ Pay GH₵${tierPrice.toFixed(2)} from Wallet`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
