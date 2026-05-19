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

  useEffect(() => {
    fetch("/api/bundles")
      .then((r) => r.json())
      .then((data) => setBundles(data.bundles ?? []));
  }, []);

  const filtered = bundles.filter((b) => b.network === activeTab);
  const net = networkConfig[activeTab];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {agentCode && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-blue-700">
          <span className="font-bold">🔗 Agent Link:</span> You&apos;re buying through a referral. Your agent earns a commission on this purchase.
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
