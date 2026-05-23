"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Bundle, Network, networkConfig } from "@/lib/bundles";
import BundleCard from "@/components/BundleCard";
import CheckoutModal from "@/components/CheckoutModal";
import VoucherModal from "@/components/VoucherModal";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AgentStorefront from "@/components/AgentStorefront";

const tabs: { id: Network; label: string; emoji: string }[] = [
  { id: "mtn", label: "MTN", emoji: "📶" },
  { id: "telecel", label: "Telecel", emoji: "📡" },
  { id: "airteltigo", label: "AirtelTigo", emoji: "🌐" },
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
  const viaCode = params.get("via") ?? undefined;

  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [agentInfoReady, setAgentInfoReady] = useState(!agentCode);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [activeTab, setActiveTab] = useState<Network>("mtn");
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [referralVia, setReferralVia] = useState<string | undefined>();

  useEffect(() => {
    if (!agentCode) { setAgentInfoReady(true); return; }
    fetch(`/api/agents/info?code=${encodeURIComponent(agentCode)}`)
      .then((r) => r.json())
      .then((d) => { setAgentInfo(d); setAgentInfoReady(true); })
      .catch(() => setAgentInfoReady(true));
  }, [agentCode]);

  useEffect(() => {
    const url = agentCode ? `/api/bundles?agent=${encodeURIComponent(agentCode)}` : "/api/bundles";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setBundles(data.bundles ?? []));
  }, [agentCode]);

  useEffect(() => {
    if (!agentCode) return;
    try { sessionStorage.setItem("agentRef", agentCode); } catch {}
  }, [agentCode]);

  useEffect(() => {
    try {
      if (viaCode) {
        sessionStorage.setItem("referralVia", viaCode);
        setReferralVia(viaCode);
      } else {
        const stored = sessionStorage.getItem("referralVia");
        if (stored) setReferralVia(stored);
      }
    } catch {}
  }, [viaCode]);

  const filtered = bundles
    .filter((b) => b.network === activeTab)
    .sort((a, b) => (a.sizeGB ?? 0) - (b.sizeGB ?? 0));
  const net = networkConfig[activeTab];

  // Best value = highest GB per GH₵
  const bestValueId = filtered.length > 0
    ? filtered.reduce((best, b) => (b.sizeGB / b.price) > (best.sizeGB / best.price) ? b : best, filtered[0]).id
    : null;

  // While waiting for agent info, show a brief spinner
  if (!agentInfoReady) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // Custom-price agent with a shop name → fully branded white-label storefront
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
    <div className="max-w-5xl mx-auto px-4 py-6 pb-10">

      <AnnouncementBanner target="customers" />

      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-800 leading-tight">Buy Data &amp; Services</h1>
        <p className="text-gray-400 text-sm mt-1">Instant delivery · Secured by Paystack</p>
      </div>

      {/* ── Services row ── */}
      <div className="mb-8">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Featured Services</p>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 sm:overflow-visible">

          {/* Vouchers card */}
          <button
            onClick={() => setVoucherOpen(true)}
            className="flex-shrink-0 w-64 sm:w-auto bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex -space-x-2 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg z-10 border-2 border-white">📗</div>
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg border-2 border-white">📘</div>
              </div>
              <div>
                <p className="font-black text-gray-800 text-sm leading-tight">Result Checker</p>
                <p className="text-[11px] text-gray-400">BECE &amp; WASSCE</p>
              </div>
            </div>
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">BECE Voucher</span>
                <span className="font-black text-blue-600">GH₵18</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">WASSCE Voucher</span>
                <span className="font-black text-purple-600">GH₵18</span>
              </div>
              <p className="text-[10px] text-gray-400">Codes sent via SMS instantly</p>
            </div>
            <div className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold py-2 rounded-xl text-center group-hover:opacity-90 transition-opacity">
              Buy Voucher →
            </div>
          </button>


          {/* Business bulk top-up card */}
          <a
            href="/business"
            className="flex-shrink-0 w-64 sm:w-auto bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-lg shrink-0">🏢</div>
              <div>
                <p className="font-black text-gray-800 text-sm leading-tight">Business Top-up</p>
                <p className="text-[11px] text-gray-400">2–50 numbers at once</p>
              </div>
            </div>
            <div className="space-y-1 mb-3">
              <p className="text-xs text-gray-500">Top up your whole team, church, or school in a single payment.</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[11px] text-indigo-600 font-semibold">MTN · Telecel · AirtelTigo</span>
              </div>
            </div>
            <div className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-bold py-2 rounded-xl text-center group-hover:opacity-90 transition-opacity">
              Bulk Order →
            </div>
          </a>

          {/* Track Order card */}
          <a
            href="/track"
            className="flex-shrink-0 w-64 sm:w-auto bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-left hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg shrink-0">📦</div>
              <div>
                <p className="font-black text-gray-800 text-sm leading-tight">Track Order</p>
                <p className="text-[11px] text-gray-400">Live delivery status</p>
              </div>
            </div>
            <div className="space-y-1 mb-3">
              <p className="text-xs text-gray-500">Check real-time delivery status for any order you placed.</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                <span className="text-[11px] text-green-600 font-semibold">Live tracking available</span>
              </div>
            </div>
            <div className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold py-2 rounded-xl text-center group-hover:opacity-90 transition-opacity">
              Track Now →
            </div>
          </a>

        </div>
      </div>

      {/* ── Data Bundles ── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Data Bundles</p>

        {/* Network tabs */}
        <div className="flex gap-2 mb-5 bg-gray-100 rounded-2xl p-1.5">
          {tabs.map((tab) => {
            const n = networkConfig[tab.id];
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-sm transition-all ${
                  active ? `${n.bgColor} text-white shadow-md` : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className="text-base">{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active network pill */}
        <div className={`${net.bgLight} rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2.5`}>
          <div className={`w-8 h-8 ${net.bgColor} rounded-full flex items-center justify-center text-white font-black text-xs shrink-0`}>
            {net.logo}
          </div>
          <div>
            <p className={`font-bold text-sm ${net.textColor}`}>{net.name} Data Bundles</p>
            <p className="text-gray-400 text-xs">Delivered instantly after payment</p>
          </div>
        </div>

        {/* Bundle grid */}
        {bundles.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-2xl h-40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p className="font-medium">No bundles available for {net.name} right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((bundle) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                onBuy={setSelectedBundle}
                isBestValue={bundle.id === bestValueId}
              />
            ))}
          </div>
        )}

        {/* Trust strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: "⚡", text: "Instant Delivery" },
            { icon: "🔒", text: "Secure Payment" },
            { icon: "📞", text: "WhatsApp Support" },
            { icon: "✅", text: "Paystack Verified" },
          ].map((item) => (
            <div key={item.text} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm">
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs font-semibold text-gray-600">{item.text}</span>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">Important: </span>
          All bundles are delivered within 1–5 minutes. Ensure your phone number is correct. For issues, contact us on WhatsApp immediately.
        </div>
      </div>

      {selectedBundle && (
        <CheckoutModal
          bundle={selectedBundle}
          agentCode={agentCode}
          referralVia={referralVia}
          onClose={() => setSelectedBundle(null)}
        />
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
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    }>
      <BuyContent />
    </Suspense>
  );
}
