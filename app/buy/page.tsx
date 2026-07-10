"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Bundle, Network, networkConfig } from "@/lib/bundles";
import CheckoutModal from "@/components/CheckoutModal";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AgentStorefront from "@/components/AgentStorefront";
import SocialProofTicker from "@/components/SocialProofTicker";

const NETS: { id: Network | "mashup"; label: string; color: string; text: string }[] = [
  { id: "mtn",        label: "MTN",        color: "#f59e0b", text: "#78350f" },
  { id: "telecel",    label: "Telecel",    color: "#ef4444", text: "#ffffff" },
  { id: "airteltigo", label: "AirtelTigo", color: "#3b82f6", text: "#ffffff" },
  { id: "mashup",     label: "Mashup",     color: "#8b5cf6", text: "#ffffff" },
];

const D = { bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e" };

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

  const [agentInfo, setAgentInfo]           = useState<AgentInfo | null>(null);
  const [agentInfoReady, setAgentInfoReady] = useState(!agentCode);
  const [bundles, setBundles]               = useState<Bundle[]>([]);
  const [mashupBundles, setMashupBundles]   = useState<{id:string;name:string;data_value:number;data_unit:string;minutes:number;price:number}[]>([]);
  const [activeNet, setActiveNet]           = useState<Network | "mashup">("mtn");
  const [selected, setSelected]             = useState<Bundle | null>(null);
  const [referralVia, setReferralVia]       = useState<string | undefined>();
  const [netStatus, setNetStatus]           = useState<{ mtn: boolean; telecel: boolean; at: boolean; mashup: boolean }>({ mtn: true, telecel: true, at: true, mashup: true });
  const [slowDelivery, setSlowDelivery]     = useState(false);

  useEffect(() => {
    fetch("/api/network-status").then(r => r.json()).then(d => {
      setSlowDelivery(d.slowDelivery === true);
      const status = { mtn: d.mtn !== false, telecel: d.telecel !== false, at: d.at !== false, mashup: d.mashup !== false };
      setNetStatus(status);
      // Auto-select first enabled network so bundles show without clicking
      const statusMap: Record<string, boolean> = { mtn: status.mtn, telecel: status.telecel, airteltigo: status.at, mashup: status.mashup };
      const firstEnabled = NETS.find(n => statusMap[n.id] !== false);
      if (firstEnabled) setActiveNet(firstEnabled.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!agentCode) { setAgentInfoReady(true); return; }
    fetch(`/api/agents/info?code=${encodeURIComponent(agentCode)}`)
      .then(r => r.json()).then(d => { setAgentInfo(d); setAgentInfoReady(true); })
      .catch(() => setAgentInfoReady(true));
  }, [agentCode]);

  useEffect(() => {
    const url = agentCode ? `/api/bundles?agent=${encodeURIComponent(agentCode)}` : "/api/bundles";
    fetch(url).then(r => r.json()).then(d => setBundles(d.bundles ?? []));
    fetch("/api/mashup-bundles").then(r => r.json()).then(d => setMashupBundles(d.bundles ?? []));
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

  const netStatusMap: Record<string, boolean> = { mtn: netStatus.mtn, telecel: netStatus.telecel, airteltigo: netStatus.at, mashup: netStatus.mashup };
  const visibleNets = NETS.filter(n => netStatusMap[n.id] !== false);
  const net = visibleNets.find(n => n.id === activeNet) ?? visibleNets[0] ?? NETS[0];
  const filtered = activeNet === "mashup" ? [] : bundles.filter(b => b.network === activeNet).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const bestId = filtered.length > 0
    ? filtered.reduce((bst, b) => (b.sizeGB / b.price) > (bst.sizeGB / bst.price) ? b : bst, filtered[0]).id
    : null;

  return (
    <div style={{ background: D.bg, minHeight: "100vh", color: D.text, fontFamily: "system-ui,sans-serif" }}>
      <SocialProofTicker />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px 80px" }}>

        <AnnouncementBanner target="customers" />

        {/* Slow delivery banner */}
        {slowDelivery && (
          <div style={{ marginBottom: 12, background: "#fff8e7", border: "1px solid #fcd34d", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🐢</span>
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: "#92400e" }}>Deliveries are slow today</p>
              <p style={{ margin: 0, fontSize: 12, color: "#b45309", marginTop: 2 }}>Your data will be delivered but may take a little longer than usual. Thank you for your patience.</p>
            </div>
          </div>
        )}

        {/* Delivery notice */}
        <div style={{ marginTop: 16, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚡</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#4ade80", margin: "0 0 2px" }}>Fast Delivery</p>
            <p style={{ fontSize: 12, color: D.muted, margin: 0 }}>Most orders are delivered within 10 minutes to 1 hour depending on network conditions.</p>
          </div>
        </div>

        {/* Hero */}
        <div style={{ paddingTop: 20, paddingBottom: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: D.text, margin: "0 0 4px" }}>Buy Data Bundles</h1>
          <p style={{ fontSize: 13, color: D.muted, margin: 0 }}>Instant delivery · Secured by Paystack</p>
        </div>

        {/* Refund banner */}
        <a href="/track" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 16, padding: "14px 18px", marginBottom: 20, textDecoration: "none" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#f87171", margin: "0 0 2px" }}>💸 Need a Refund?</p>
            <p style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>Didn't receive your data? We'll refund you within 12 hours.</p>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171", whiteSpace: "nowrap", flexShrink: 0 }}>Request →</span>
        </a>

        {/* Quick links */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
          {[
            { label: "Track Order",      sub: "Check delivery status",    icon: "📦", href: "/track",    color: "#22c55e" },
            { label: "Result Checker",   sub: "BECE & WASSCE vouchers",   icon: "📗", href: "/vouchers", color: "#a855f7" },
            { label: "Business Top-up",  sub: "2–50 numbers at once",     icon: "🏢", href: "/business", color: "#f59e0b" },
            { label: "Become an Agent",  sub: "Earn on every sale",       icon: "🤝", href: "/agent",    color: "#3b82f6" },
          ].map(item => (
            <a key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", gap: 10, background: D.card, border: `1px solid ${D.border}`, borderRadius: 14, padding: "12px 14px", textDecoration: "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${item.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: D.text, margin: 0 }}>{item.label}</p>
                <p style={{ fontSize: 11, color: D.muted, margin: 0 }}>{item.sub}</p>
              </div>
            </a>
          ))}
        </div>

        {/* Network selector — icon style */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {visibleNets.map(n => (
            <button key={n.id} onClick={() => setActiveNet(n.id)} style={{ flex: 1, padding: "14px 8px", borderRadius: 16, border: `2px solid ${activeNet === n.id ? n.color : D.border}`, background: activeNet === n.id ? `${n.color}15` : D.card, cursor: "pointer", transition: "all .2s" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: activeNet === n.id ? n.color : `${n.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: activeNet === n.id ? n.text : n.color, margin: "0 auto 6px" }}>
                {n.label.slice(0, 3)}
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: activeNet === n.id ? n.color : D.muted }}>{n.label}</p>
            </button>
          ))}
        </div>

        {/* Active network header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: `${net.color}10`, border: `1px solid ${net.color}30`, borderRadius: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: net.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: net.text }}>
            {net.label.slice(0, 3)}
          </div>
          <p style={{ margin: 0, fontWeight: 800, color: net.color, fontSize: 14 }}>{net.label} Data Bundles</p>
          <span style={{ marginLeft: "auto", fontSize: 11, color: D.muted }}>Delivered instantly</span>
        </div>

        {/* Bundle grid */}
        {activeNet === "mashup" ? (
          mashupBundles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: D.muted }}>
              <p style={{ fontSize: 32, margin: "0 0 8px" }}>📭</p>
              <p style={{ fontSize: 14 }}>No Mashup bundles available right now.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {mashupBundles.map(b => {
                const asBundle: Bundle = {
                  id: b.id, network: "mtn",
                  size: b.minutes > 0 ? `${b.data_value}${b.data_unit} + ${b.minutes}min` : `${b.data_value}${b.data_unit}`,
                  sizeGB: b.data_unit === "MB" ? b.data_value / 1024 : b.data_value,
                  price: b.price, costPrice: 0, validity: "30 days",
                };
                return (
                  <button key={b.id} onClick={() => setSelected(asBundle)} style={{ background: D.card, border: `2px solid #8b5cf620`, borderRadius: 18, padding: 18, cursor: "pointer", textAlign: "left", position: "relative", transition: "all .15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>Mashup</span>
                      <span style={{ fontSize: 10, color: D.muted }}>30 days</span>
                    </div>
                    <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 900, color: D.text, lineHeight: 1.3 }}>{b.name}</p>
                    {b.minutes > 0 && <p style={{ margin: "2px 0 6px", fontSize: 11, color: "#a78bfa", fontWeight: 600 }}>📞 {b.minutes} mins</p>}
                    <p style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 900, color: "#8b5cf6" }}>GH₵{b.price.toFixed(2)}</p>
                    <div style={{ background: "#8b5cf6", color: "#fff", borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 800, textAlign: "center" }}>
                      Buy Now ⚡
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : bundles.length === 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: D.card, borderRadius: 18, height: 160, border: `1px solid ${D.border}` }} className="animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: D.muted }}>
            <p style={{ fontSize: 32, margin: "0 0 8px" }}>📭</p>
            <p style={{ fontSize: 14 }}>No bundles available for {net.label} right now.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map(b => (
              <button key={b.id} onClick={() => setSelected(b)} style={{ background: D.card, border: `2px solid ${b.id === bestId ? net.color : D.border}`, borderRadius: 18, padding: 18, cursor: "pointer", textAlign: "left", position: "relative", boxShadow: b.id === bestId ? `0 0 24px ${net.color}20` : "none", transition: "all .15s" }}>
                {b.id === bestId && (
                  <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: net.color, color: net.text, fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    ⭐ Best Value
                  </span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: `${net.color}20`, color: net.color }}>{net.label}</span>
                  <span style={{ fontSize: 10, color: D.muted }}>{b.validity ?? ""}</span>
                </div>
                <p style={{ margin: "0 0 2px", fontSize: 30, fontWeight: 900, color: D.text, lineHeight: 1 }}>{b.size}</p>
                <p style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 900, color: net.color }}>GH₵{b.price.toFixed(2)}</p>
                <div style={{ background: net.color, color: net.text, borderRadius: 12, padding: "11px 0", fontSize: 13, fontWeight: 800, textAlign: "center" }}>
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
            <div key={t.text} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
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
