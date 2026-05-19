"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Bundle, Network, networkConfig } from "@/lib/bundles";
import BundleCard from "@/components/BundleCard";
import CheckoutModal from "@/components/CheckoutModal";

const tabs: { id: Network; label: string }[] = [
  { id: "mtn", label: "MTN" },
  { id: "telecel", label: "Telecel" },
  { id: "airteltigo", label: "AirtelTigo" },
];

function BuyContent() {
  const params = useSearchParams();
  const agentCode = params.get("agent") ?? undefined;

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [activeTab, setActiveTab] = useState<Network>("mtn");
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentWhatsapp, setAgentWhatsapp] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bundles")
      .then((r) => r.json())
      .then((data) => setBundles(data.bundles ?? []));
  }, []);

  useEffect(() => {
    if (!agentCode) return;
    try { sessionStorage.setItem("agentRef", agentCode); } catch {}
    fetch(`/api/agents/info?code=${encodeURIComponent(agentCode)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setAgentName(d.name);
          setAgentWhatsapp(d.whatsapp || null);
        }
      })
      .catch(() => {});
  }, [agentCode]);

  const filtered = bundles.filter((b) => b.network === activeTab);
  const net = networkConfig[activeTab];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {agentCode && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm text-blue-700">
          <span>
            <span className="font-bold">🔗 Agent Link{agentName ? `: ${agentName}` : ""}.</span>{" "}
            Your agent earns a commission on this purchase.
          </span>
          {agentWhatsapp && (
            <a
              href={`https://wa.me/${agentWhatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
              WhatsApp Agent
            </a>
          )}
        </div>
      )}

      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black text-gray-800 mb-1">Buy Data Bundles</h1>
        <p className="text-gray-500">Select your network and choose a bundle</p>
      </div>

      {/* Network Tabs */}
      <div className="flex gap-2 mb-8 bg-white rounded-2xl p-2 shadow-sm border border-gray-100 overflow-x-auto">
        {tabs.map((tab) => {
          const n = networkConfig[tab.id];
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${active ? `${n.bgColor} text-white shadow` : "text-gray-500 hover:bg-gray-50"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${active ? "bg-white/30 text-white" : `${n.bgColor} text-white`}`}>
                {n.logo.charAt(0)}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active network info */}
      <div className={`${net.bgLight} border ${net.borderColor} rounded-xl px-4 py-3 mb-6 flex items-center gap-3`}>
        <div className={`w-10 h-10 ${net.bgColor} rounded-full flex items-center justify-center text-white font-black text-sm`}>
          {net.logo}
        </div>
        <div>
          <p className={`font-bold ${net.textColor}`}>{net.name} Data Bundles</p>
          <p className="text-gray-500 text-xs">All bundles are delivered instantly after payment</p>
        </div>
      </div>

      {/* Bundle Grid */}
      {bundles.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl h-40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filtered.map((bundle) => (
            <BundleCard key={bundle.id} bundle={bundle} onBuy={setSelectedBundle} />
          ))}
        </div>
      )}

      {/* Info */}
      <div className="mt-10 bg-white rounded-2xl border border-gray-100 p-5 text-sm text-gray-500 shadow-sm">
        <p className="font-semibold text-gray-700 mb-2">Important Information</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>All bundles are delivered within 1–5 minutes of payment.</li>
          <li>Ensure your phone number is correct before completing payment.</li>
          <li>For issues, contact us on WhatsApp immediately.</li>
          <li>Payments are processed securely via Paystack.</li>
        </ul>
      </div>

      {selectedBundle && (
        <CheckoutModal bundle={selectedBundle} agentCode={agentCode} onClose={() => setSelectedBundle(null)} />
      )}
    </div>
  );
}

export default function BuyPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-20 text-center text-gray-400">Loading...</div>}>
      <BuyContent />
    </Suspense>
  );
}
