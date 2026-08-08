"use client";
import { useState, useEffect } from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import VoucherModal from "@/components/VoucherModal";
import { Bundle } from "@/lib/bundles";

const NET_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  mtn:        { bg: "#fef3c7", color: "#92400e", label: "MTN" },
  telecel:    { bg: "#fee2e2", color: "#991b1b", label: "Telecel" },
  airteltigo: { bg: "#dbeafe", color: "#1e40af", label: "AirtelTigo" },
};

interface StoreAgent {
  id: string;
  name: string;
  tagline: string | null;
  color: string;
  referral_code: string;
  agent_type: string | null;
}

export default function StorePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [agent, setAgent] = useState<StoreAgent | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeNet, setActiveNet] = useState<string>("mtn");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherPrice, setVoucherPrice] = useState(18);

  useEffect(() => {
    Promise.all([
      fetch(`/api/store/${code}`).then(r => r.json()),
      fetch(`/api/bundles?agent=${encodeURIComponent(code)}`).then(r => r.json()),
      fetch(`/api/vouchers/prices?agent=${encodeURIComponent(code)}`).then(r => r.json()),
    ]).then(([storeData, bundleData, voucherData]) => {
      if (storeData.error) { setNotFound(true); setLoading(false); return; }
      setAgent(storeData.agent);
      const b: Bundle[] = bundleData.bundles ?? [];
      setBundles(b);
      setVoucherPrice(Math.min(Number(voucherData.BECE?.sellPrice ?? 18), Number(voucherData.WASSCE?.sellPrice ?? 18)));
      // Pick first network that has bundles
      const nets = ["mtn", "telecel", "airteltigo"];
      const first = nets.find(n => b.some(x => x.network === n));
      if (first) setActiveNet(first);
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

  const nets = ["mtn", "telecel", "airteltigo"].filter(n => bundles.some(b => b.network === n));
  const shown = bundles.filter(b => b.network === activeNet);
  const themeColor = agent?.color ?? "#3b82f6";

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080f1e" }}>
      <div style={{ width: 36, height: 36, border: `4px solid ${themeColor}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound || !agent) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#080f1e", color: "#e2e8f0", gap: 12 }}>
      <p style={{ fontSize: 48 }}>🏪</p>
      <p style={{ fontSize: 22, fontWeight: 900 }}>Store Not Found</p>
      <p style={{ color: "#64748b", fontSize: 14 }}>This store link may be invalid or inactive.</p>
      <Link href="/" style={{ marginTop: 12, background: "#3b82f6", color: "white", padding: "10px 22px", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}>Go to EliteData</Link>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080f1e", color: "#e2e8f0" }}>
      {/* Hero banner */}
      <div style={{ background: `linear-gradient(135deg, ${themeColor}22, ${themeColor}08)`, borderBottom: `1px solid ${themeColor}30`, padding: "28px 20px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: themeColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "white", flexShrink: 0 }}>
              {(agent.name ?? "E").charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: "#f8fafc", margin: 0 }}>{agent.name}</h1>
                {agent.agent_type === "pro" && (
                  <span style={{ background: "#fbbf24", color: "#1e1b4b", fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 20 }}>⭐ PRO</span>
                )}
              </div>
              {agent.tagline && <p style={{ color: "#94a3b8", fontSize: 13, margin: "2px 0 0" }}>{agent.tagline}</p>}
            </div>
          </div>
          <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>Powered by EliteData · Fast & reliable data bundles</p>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px" }}>
        {/* Network tabs */}
        {nets.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
            {nets.map(n => {
              const nc = NET_COLORS[n] ?? { bg: "#1e293b", color: "#94a3b8", label: n.toUpperCase() };
              const active = activeNet === n;
              return (
                <button key={n} onClick={() => setActiveNet(n)}
                  style={{ padding: "9px 20px", borderRadius: 10, border: `2px solid ${active ? themeColor : "#1e3a5f"}`, background: active ? `${themeColor}18` : "#0d1b2e", color: active ? themeColor : "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {nc.label}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={() => setVoucherOpen(true)} style={{ width: "100%", marginTop: 20, padding: "18px", borderRadius: 16, border: `1px solid ${themeColor}55`, background: `${themeColor}12`, color: "#f8fafc", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span><strong style={{ display: "block", fontSize: 15 }}>BECE &amp; WASSCE Result Checkers</strong><small style={{ color: "#94a3b8" }}>Voucher codes sent by SMS after approval</small></span>
          <strong style={{ color: themeColor, whiteSpace: "nowrap" }}>From GH₵{voucherPrice.toFixed(2)}</strong>
        </button>

        {/* Bundle grid */}
        {shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
            <p style={{ fontSize: 40 }}>📦</p>
            <p style={{ fontWeight: 700 }}>No bundles available right now.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {shown.map(b => {
              const nc = NET_COLORS[b.network] ?? { bg: "#1e293b", color: "#94a3b8", label: b.network };
              return (
                <button key={b.id} onClick={() => router.push(`/checkout?bundle=${encodeURIComponent(b.id)}&agent=${encodeURIComponent(agent.referral_code)}`)}
                  style={{ background: "#0d1b2e", border: `2px solid #1e3a5f`, borderRadius: 16, padding: "18px 14px", cursor: "pointer", textAlign: "center", transition: "border-color 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = themeColor)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e3a5f")}>
                  <span style={{ background: nc.bg, color: nc.color, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>{nc.label}</span>
                  <p style={{ fontSize: 20, fontWeight: 900, color: "#f8fafc", margin: 0 }}>{b.size}</p>
                  <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{b.validity ?? "30 days"}</p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: themeColor, margin: "4px 0 0" }}>GH₵{Number(b.price).toFixed(2)}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p style={{ textAlign: "center", color: "#334155", fontSize: 12, marginTop: 32 }}>
          Payments secured by Paystack · <Link href="/" style={{ color: "#64748b", textDecoration: "none" }}>EliteData</Link>
        </p>
      </div>

      {voucherOpen && <VoucherModal agentCode={agent.referral_code} onClose={() => setVoucherOpen(false)} />}
    </div>
  );
}
