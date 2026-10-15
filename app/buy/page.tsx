"use client";
import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bundle, Network } from "@/lib/bundles";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AgentStorefront from "@/components/AgentStorefront";
import SocialProofTicker from "@/components/SocialProofTicker";

const NETWORKS: {
  id: Network | "mashup";
  label: string;
  badge: string;
  color: string;
  accentBg: string;
  borderColor: string;
  textColor: string;
}[] = [
  { id: "mtn", label: "MTN", badge: "Instant ⚡", color: "#FFC220", accentBg: "rgba(255,194,32,0.12)", borderColor: "rgba(255,194,32,0.35)", textColor: "#fbbf24" },
  { id: "telecel", label: "Telecel", badge: "Non-Expiry 📶", color: "#EF4444", accentBg: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)", textColor: "#f87171" },
  { id: "airteltigo", label: "AirtelTigo", badge: "Best Value 💰", color: "#E11D48", accentBg: "rgba(225,29,72,0.12)", borderColor: "rgba(225,29,72,0.35)", textColor: "#fb7185" },
  { id: "mashup", label: "Mashup", badge: "Voice + Data 📞", color: "#8B5CF6", accentBg: "rgba(139,92,246,0.12)", borderColor: "rgba(139,92,246,0.35)", textColor: "#c084fc" },
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
  const router = useRouter();
  const agentCode = params.get("agent") ?? undefined;
  const viaCode = params.get("via") ?? undefined;
  const netParam = (params.get("network") ?? "").toLowerCase();

  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [agentInfoReady, setAgentInfoReady] = useState(!agentCode);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [mashupBundles, setMashupBundles] = useState<
    { id: string; name: string; data_value: number; data_unit: string; minutes: number; price: number }[]
  >([]);
  const [activeNet, setActiveNet] = useState<Network | "mashup">(
    netParam === "telecel" || netParam === "airteltigo" || netParam === "mashup" ? netParam : "mtn"
  );
  const [sizeFilter, setSizeFilter] = useState<"all" | "small" | "medium" | "large">("all");
  const [referralVia, setReferralVia] = useState<string | undefined>();
  const [netStatus, setNetStatus] = useState<{ mtn: boolean; telecel: boolean; at: boolean; mashup: boolean }>({
    mtn: true,
    telecel: true,
    at: true,
    mashup: true,
  });
  const [slowDelivery, setSlowDelivery] = useState(false);

  function openCheckout(bundleId: string) {
    const checkoutParams = new URLSearchParams({ bundle: bundleId });
    if (agentCode) checkoutParams.set("agent", agentCode);
    if (referralVia) checkoutParams.set("via", referralVia);
    router.push(`/checkout?${checkoutParams.toString()}`);
  }

  useEffect(() => {
    fetch("/api/network-status")
      .then((r) => r.json())
      .then((d) => {
        setSlowDelivery(d.slowDelivery === true);
        const status = { mtn: d.mtn !== false, telecel: d.telecel !== false, at: d.at !== false, mashup: d.mashup !== false };
        setNetStatus(status);
        if (!netParam) {
          const statusMap: Record<string, boolean> = { mtn: status.mtn, telecel: status.telecel, airteltigo: status.at, mashup: status.mashup };
          const firstEnabled = NETWORKS.find((n) => statusMap[n.id] !== false);
          if (firstEnabled) setActiveNet(firstEnabled.id);
        }
      })
      .catch(() => {});
  }, [netParam]);

  useEffect(() => {
    if (!agentCode) {
      setAgentInfoReady(true);
      return;
    }
    fetch(`/api/agents/info?code=${encodeURIComponent(agentCode)}`)
      .then((r) => r.json())
      .then((d) => {
        setAgentInfo(d);
        setAgentInfoReady(true);
      })
      .catch(() => setAgentInfoReady(true));
  }, [agentCode]);

  useEffect(() => {
    const url = agentCode ? `/api/bundles?agent=${encodeURIComponent(agentCode)}` : "/api/bundles";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setBundles(d.bundles ?? []));
    fetch("/api/mashup-bundles")
      .then((r) => r.json())
      .then((d) => setMashupBundles(d.bundles ?? []));
  }, [agentCode]);

  useEffect(() => {
    if (agentCode) {
      try {
        sessionStorage.setItem("agentRef", agentCode);
      } catch {}
    }
  }, [agentCode]);

  useEffect(() => {
    try {
      if (viaCode) {
        sessionStorage.setItem("referralVia", viaCode);
        setReferralVia(viaCode);
      } else {
        const s = sessionStorage.getItem("referralVia");
        if (s) setReferralVia(s);
      }
    } catch {}
  }, [viaCode]);

  const netStatusMap: Record<string, boolean> = {
    mtn: netStatus.mtn,
    telecel: netStatus.telecel,
    airteltigo: netStatus.at,
    mashup: netStatus.mashup,
  };
  const visibleNets = NETWORKS.filter((n) => netStatusMap[n.id] !== false);
  const currentNet = visibleNets.find((n) => n.id === activeNet) ?? visibleNets[0] ?? NETWORKS[0];

  const filteredBundles = useMemo(() => {
    if (activeNet === "mashup") return [];
    let list = bundles.filter((b) => b.network === activeNet).sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
    if (sizeFilter === "small") {
      list = list.filter((b) => (b.sizeGB ?? 0) <= 5);
    } else if (sizeFilter === "medium") {
      list = list.filter((b) => (b.sizeGB ?? 0) > 5 && (b.sizeGB ?? 0) <= 15);
    } else if (sizeFilter === "large") {
      list = list.filter((b) => (b.sizeGB ?? 0) >= 20);
    }
    return list;
  }, [bundles, activeNet, sizeFilter]);

  const bestValueId = useMemo(() => {
    if (filteredBundles.length === 0) return null;
    return filteredBundles.reduce(
      (best, b) => (b.sizeGB / b.price > best.sizeGB / best.price ? b : best),
      filteredBundles[0]
    ).id;
  }, [filteredBundles]);

  if (!agentInfoReady) {
    return (
      <div className="min-h-screen bg-[#060a12] flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (agentCode && agentInfo?.agent_type === "custom_price" && agentInfo?.shop_name) {
    return (
      <AgentStorefront
        shopName={agentInfo.shop_name}
        agentName={agentInfo.name ?? ""}
        agentWhatsapp={agentInfo.whatsapp ?? ""}
        agentCode={agentCode}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 selection:bg-amber-400 selection:text-slate-950 pb-24">
      <SocialProofTicker />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        <AnnouncementBanner target="customers" />

        {/* Slow delivery warning if flagged */}
        {slowDelivery && (
          <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 flex items-center gap-3">
            <span className="text-2xl">🐢</span>
            <div>
              <p className="text-sm font-bold text-amber-300">Deliveries are experiencing slight delays today</p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                Your data order will be delivered, but carrier fulfillment may take slightly longer. Thank you for your patience!
              </p>
            </div>
          </div>
        )}

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-2">
              <span>⚡ Verified Wholesale Rates</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Select Data Bundle</h1>
            <p className="text-slate-400 text-sm mt-1">Instant delivery directly to your phone. Pay securely with MoMo or Card.</p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/track"
              className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5"
            >
              <span>🔍</span> Track Order
            </Link>
            <Link
              href="/vouchers"
              className="px-4 py-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-xs font-bold text-purple-300 hover:bg-purple-500/20 transition-all flex items-center gap-1.5"
            >
              <span>🎓</span> Result Checkers
            </Link>
          </div>
        </div>

        {/* Network Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-6">
          {visibleNets.map((n) => {
            const isActive = activeNet === n.id;
            return (
              <button
                key={n.id}
                onClick={() => {
                  setActiveNet(n.id);
                  setSizeFilter("all");
                }}
                className={`relative rounded-2xl p-3.5 sm:p-4 text-left transition-all duration-200 border flex flex-col justify-between ${
                  isActive
                    ? "shadow-lg scale-[1.01]"
                    : "bg-[#0b1220] border-white/10 hover:border-white/20 opacity-80 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: isActive ? n.accentBg : undefined,
                  borderColor: isActive ? n.color : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs text-slate-950 shadow"
                    style={{ backgroundColor: n.color }}
                  >
                    {n.label.slice(0, 3)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{n.badge}</span>
                </div>
                <div className="mt-3">
                  <p className="text-base font-black text-white">{n.label}</p>
                  <p className="text-[11px] font-semibold" style={{ color: n.textColor }}>
                    {n.id === "mashup" ? "Voice + Data" : "Internet Bundle"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Size Filter Pills (if not Mashup) */}
        {activeNet !== "mashup" && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 text-xs font-bold">
            <span className="text-slate-500 uppercase text-[10px] tracking-wider font-semibold mr-1">Filter Size:</span>
            {[
              { id: "all", label: "All Packages" },
              { id: "small", label: "1GB – 5GB" },
              { id: "medium", label: "6GB – 15GB" },
              { id: "large", label: "20GB – 40GB" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSizeFilter(f.id as typeof sizeFilter)}
                className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap ${
                  sizeFilter === f.id
                    ? "bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-400/20"
                    : "border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Active Banner Indicator */}
        <div
          className="rounded-2xl p-4 mb-8 flex items-center justify-between border"
          style={{
            backgroundColor: currentNet.accentBg,
            borderColor: currentNet.borderColor,
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-slate-950"
              style={{ backgroundColor: currentNet.color }}
            >
              {currentNet.label.slice(0, 3)}
            </span>
            <div>
              <p className="text-sm font-black text-white">Active Catalog: {currentNet.label}</p>
              <p className="text-xs text-slate-300">
                {activeNet === "mashup"
                  ? "Manual fulfillment by administrator within 10–30 mins"
                  : "Automated instant delivery directly to recipient number"}
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-block text-xs font-bold px-3 py-1 rounded-full bg-white/10 text-white">
            {activeNet === "mashup" ? `${mashupBundles.length} Bundles` : `${filteredBundles.length} Packages`}
          </span>
        </div>

        {/* Bundle Grid */}
        {activeNet === "mashup" ? (
          mashupBundles.length === 0 ? (
            <div className="text-center py-20 rounded-3xl border border-white/10 bg-[#0a1120]">
              <p className="text-4xl mb-3">📭</p>
              <h3 className="text-lg font-bold text-white">No Mashup Bundles Available</h3>
              <p className="text-sm text-slate-400 mt-1">Check back later or choose standard MTN data bundles.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mashupBundles.map((b) => (
                <div
                  key={b.id}
                  onClick={() => openCheckout(b.id)}
                  className="group relative rounded-2xl border border-purple-500/25 bg-[#0b1222] p-5 cursor-pointer hover:border-purple-500 hover:shadow-xl hover:shadow-purple-500/10 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-purple-500/20 text-purple-300">
                        Mashup Combo
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">30 Days</span>
                    </div>
                    <h3 className="text-xl font-black text-white">{b.name}</h3>
                    {b.minutes > 0 && (
                      <p className="mt-1 text-xs font-bold text-purple-300">📞 Includes {b.minutes} Mins Airtime</p>
                    )}
                  </div>
                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 font-semibold block">Price</span>
                      <span className="text-2xl font-black text-purple-400">GH₵{b.price.toFixed(2)}</span>
                    </div>
                    <button className="px-5 py-2.5 rounded-xl bg-purple-600 group-hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all">
                      Buy Now ⚡
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : bundles.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-[#0b1220] border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : filteredBundles.length === 0 ? (
          <div className="text-center py-20 rounded-3xl border border-white/10 bg-[#0a1120]">
            <p className="text-4xl mb-3">🔍</p>
            <h3 className="text-lg font-bold text-white">No bundles match this size filter</h3>
            <button
              onClick={() => setSizeFilter("all")}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs"
            >
              Show All {currentNet.label} Packages
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBundles.map((b) => {
              const isBest = b.id === bestValueId;
              return (
                <div
                  key={b.id}
                  onClick={() => openCheckout(b.id)}
                  className={`group relative rounded-3xl p-6 cursor-pointer transition-all duration-200 border flex flex-col justify-between ${
                    isBest
                      ? "bg-gradient-to-b from-[#131d33] to-[#0b1222] border-amber-400/60 shadow-xl shadow-amber-400/10 hover:-translate-y-1"
                      : "bg-[#0b1222] border-white/10 hover:border-white/25 hover:-translate-y-1"
                  }`}
                >
                  {isBest && (
                    <span className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-wider shadow">
                      ⭐ Top Value Pick
                    </span>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-md"
                        style={{ backgroundColor: currentNet.accentBg, color: currentNet.textColor }}
                      >
                        {currentNet.label}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">{b.validity || "Non-Expiry"}</span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <h3 className="text-4xl font-black text-white tracking-tight">{b.size}</h3>
                      <span className="text-xs text-slate-400 font-semibold uppercase">Internet Data</span>
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase text-slate-500 font-semibold block">Price</span>
                      <span className="text-2xl font-black text-white">GH₵{b.price.toFixed(2)}</span>
                    </div>

                    <button
                      className="px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-md group-hover:scale-105 active:scale-95"
                      style={{
                        backgroundColor: currentNet.color,
                        color: "#000",
                      }}
                    >
                      Buy Now ⚡
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Guarantees & Help Grid */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4 flex items-center gap-3.5">
            <span className="text-2xl">⚡</span>
            <div>
              <p className="text-xs font-bold text-white">Instant Fulfillment</p>
              <p className="text-[11px] text-slate-400">Automated queue delivers directly to recipient</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4 flex items-center gap-3.5">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-xs font-bold text-white">Secure MoMo Prompt</p>
              <p className="text-[11px] text-slate-400">Authorize securely on your personal handset</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4 flex items-center gap-3.5">
            <span className="text-2xl">🔄</span>
            <div>
              <p className="text-xs font-bold text-white">100% Refund Policy</p>
              <p className="text-[11px] text-slate-400">Full refund if telecom outage prevents delivery</p>
            </div>
          </div>
        </div>

        {/* Need Help Banner */}
        <div className="mt-8 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-300">Have questions about bundle delivery or payment?</p>
            <p className="text-xs text-blue-400/80 mt-0.5">Our support team is available on WhatsApp 24/7 to help you.</p>
          </div>
          <a
            href="https://wa.me/233509794503"
            target="_blank"
            rel="noreferrer"
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs whitespace-nowrap shadow transition-all"
          >
            Chat Support 💬
          </a>
        </div>
      </div>
    </div>
  );
}

export default function BuyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060a12] flex items-center justify-center">
          <div className="w-9 h-9 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <BuyContent />
    </Suspense>
  );
}
