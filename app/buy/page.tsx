"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Bundle, Network, networkConfig } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";
import VoucherModal from "@/components/VoucherModal";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AgentStorefront from "@/components/AgentStorefront";
import SocialProofTicker from "@/components/SocialProofTicker";

const D = {
  bg: "#0d1117",
  card: "#161b22",
  cardHover: "#1c2230",
  border: "#21262d",
  text: "#e6edf3",
  muted: "#8b949e",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
};

const NETS: { id: Network; label: string; color: string; textDark: string; badge: string }[] = [
  { id: "mtn",       label: "MTN",        color: "#f59e0b", textDark: "#78350f", badge: "#fbbf24" },
  { id: "telecel",   label: "Telecel",    color: "#ef4444", textDark: "#ffffff", badge: "#f87171" },
  { id: "airteltigo",label: "AirtelTigo", color: "#3b82f6", textDark: "#ffffff", badge: "#60a5fa" },
];

interface AgentInfo {
  success?: boolean;
  name?: string;
  whatsapp?: string;
  agent_type?: string | null;
  shop_name?: string | null;
}

function BuyContent() {
  const params = useSearchParams();
  const agentCode = params.get("agent") ?? undefined;
  const viaCode   = params.get("via")   ?? undefined;

  const [agentInfo, setAgentInfo]       = useState<AgentInfo | null>(null);
  const [agentInfoReady, setAgentInfoReady] = useState(!agentCode);
  const [bundles, setBundles]           = useState<Bundle[]>([]);
  const [activeNet, setActiveNet]       = useState<Network>("mtn");
  const [selected, setSelected]         = useState<Bundle | null>(null);
  const [voucherOpen, setVoucherOpen]   = useState(false);
  const [referralVia, setReferralVia]   = useState<string | undefined>();

  useEffect(() => {
    if (!agentCode) { setAgentInfoReady(true); return; }
    fetch(`/api/agents/info?code=${encodeURIComponent(agentCode)}`)
      .then(r => r.json()).then(d => { setAgentInfo(d); setAgentInfoReady(true); })
      .catch(() => setAgentInfoReady(true));
  }, [agentCode]);

  useEffect(() => {
    const url = agentCode ? `/api/bundles?agent=${encodeURIComponent(agentCode)}` : "/api/bundles";
    fetch(url).then(r => r.json()).then(d => setBundles(d.bundles ?? []));
  }, [agentCode]);

  useEffect(() => {
    if (agentCode) { try { sessionStorage.setItem("agentRef", agentCode); } catch {} }
  }, [agentCode]);

  useEffect(() => {
    try {
      if (viaCode) { sessionStorage.setItem("referralVia", viaCode); setReferralVia(viaCode); }
      else { const s = sessionStorage.getItem("referralVia"); if (s) setReferralVia(s); }
    } catch {}
  }, [viaCode]);

  if (!agentInfoReady) {
    return (
      <div style={{ background: D.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (agentCode && agentInfo?.agent_type === "custom_price" && agentInfo?.shop_name) {
    return <AgentStorefront shopName={agentInfo.shop_name} agentName={agentInfo.name ?? ""} agentWhatsapp={agentInfo.whatsapp ?? ""} agentCode={agentCode} />;
  }

  const net = NETS.find(n => n.id === activeNet) ?? NETS[0];
  const filtered = bundles.filter(b => b.network === activeNet).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const bestId = filtered.length > 0 ? filtered.reduce((bst, b) => (b.sizeGB / b.price) > (bst.sizeGB / bst.price) ? b : bst, filtered[0]).id : null;

  return (
    <div style={{ background: D.bg, minHeight: "100vh", color: D.text }}>
      <SocialProofTicker />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px 80px" }}>

        <AnnouncementBanner target="customers" />

        {/* Delivery time notice */}
        <div style={{ marginTop: 16, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚡</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#4ade80", margin: "0 0 2px" }}>Fast Delivery</p>
            <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>Most orders are delivered within 10 minutes to 1 hour depending on network conditions.</p>
          </div>
        </div>

        {/* Hero */}
        <div style={{ paddingTop: 20, paddingBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: D.text, margin: "0 0 4px" }}>Buy Data Bundles</h1>
          <p style={{ fontSize: 13, color: D.muted, margin: 0 }}>Instant delivery · Secured by Paystack</p>
        </div>

        {/* Quick links */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Track Order", sub: "Check delivery status", icon: "📦", href: "/track", color: "#22c55e" },
            { label: "Result Checker", sub: "BECE & WASSCE vouchers", icon: "📗", action: () => setVoucherOpen(true), color: "#a855f7" },
            { label: "Business Top-up", sub: "2–50 numbers at once", icon: "🏢", href: "/business", color: "#f59e0b" },
            { label: "Become an Agent", sub: "Earn on every sale", icon: "🤝", href: "/agent", color: "#3b82f6" },
          ].map(item => (
            item.href ? (
              <a key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", gap: 10, background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: "12px 14px", textDecoration: "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: 0 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>{item.sub}</p>
                </div>
              </a>
            ) : (
              <button key={item.label} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 10, background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: 0 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>{item.sub}</p>
                </div>
              </button>
            )
          ))}
        </div>

        {/* Network tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {NETS.map(n => (
            <button key={n.id} onClick={() => setActiveNet(n.id)} style={{
              flex: 1, padding: "12px 8px", borderRadius: 12, border: `2px solid ${activeNet === n.id ? n.color : D.border}`,
              background: activeNet === n.id ? `${n.color}18` : D.card,
              color: activeNet === n.id ? n.color : D.muted,
              fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
            }}>
              {n.label}
            </button>
          ))}
        </div>

        {/* Active network header */}
        <div style={{ background: `${net.color}15`, border: `1px solid ${net.color}40`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: net.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, color: net.textDark, flexShrink: 0 }}>
            {net.label.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: net.color, margin: 0 }}>{net.label} Data Bundles</p>
            <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>Delivered instantly · No delays</p>
          </div>
        </div>

        {/* Bundle grid */}
        {bundles.length === 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: D.card, borderRadius: 14, height: 140, border: `1px solid ${D.border}` }} className="animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: D.muted }}>
            <p style={{ fontSize: 32, margin: "0 0 8px" }}>📭</p>
            <p style={{ fontSize: 14 }}>No bundles available for {net.label} right now.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {filtered.map(b => (
              <button key={b.id} onClick={() => setSelected(b)} style={{
                background: D.card, border: `2px solid ${b.id === bestId ? "#22c55e" : D.border}`,
                borderRadius: 16, padding: 16, cursor: "pointer", textAlign: "left", position: "relative",
                transition: "all 0.15s",
              }}>
                {b.id === bestId && (
                  <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#22c55e", color: "white", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    Best Value
                  </span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: `${net.color}25`, color: net.color }}>{net.label}</span>
                  <span style={{ fontSize: 10, color: D.muted }}>{b.validity ?? ""}</span>
                </div>
                <p style={{ fontSize: 28, fontWeight: 900, color: D.text, margin: "0 0 6px", lineHeight: 1 }}>{b.size}</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: net.color, margin: "0 0 12px" }}>GH₵{b.price.toFixed(2)}</p>
                <div style={{ width: "100%", background: net.color, color: net.textDark, border: "none", borderRadius: 10, padding: "9px 0", fontSize: 12, fontWeight: 800, textAlign: "center" }}>
                  Buy Now ⚡
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Trust badges */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 24 }}>
          {[
            { icon: "⚡", text: "Instant Delivery" },
            { icon: "🔒", text: "Secured by Paystack" },
            { icon: "💬", text: "WhatsApp Support" },
            { icon: "✅", text: "All Networks" },
          ].map(t => (
            <div key={t.text} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: D.muted }}>{t.text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 12, padding: "12px 16px" }}>
          <p style={{ fontSize: 12, color: "#93c5fd", margin: 0 }}>
            <strong>Important:</strong> Bundles are delivered within 1–5 minutes. Make sure your phone number is correct. For issues, WhatsApp us immediately.
          </p>
        </div>
      </div>

      {selected && (
        <CheckoutModal bundle={selected} agentCode={agentCode} referralVia={referralVia} onClose={() => setSelected(null)} />
      )}
      {voucherOpen && (
        <VoucherModal agentCode={agentCode} onClose={() => setVoucherOpen(false)} />
      )}
    </div>
  );
}

export default function BuyPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "#0d1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BuyContent />
    </Suspense>
  );
}
