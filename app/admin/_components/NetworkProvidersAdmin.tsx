"use client";
import { useState, useEffect } from "react";

const CARD = "#111827", BORDER = "#1f2937";

type MtnProvider = "inventor" | "yhangmhany" | "auto";

interface ProviderData {
  inventorBalance: number | null;
  yhangMhanyBalance: number | null;
  mtnProvider: MtnProvider;
  checkedAt: string;
}

const OPTIONS: { key: MtnProvider; icon: string; label: string; accent: string; bg: string; note: string }[] = [
  { key: "inventor", icon: "🚀", label: "Inventor", accent: "#16a34a", bg: "#0c2a0c", note: "Checkout blocks numbers not on the beneficiary list. Any that slip through hold for manual delivery (up to 72h)." },
  { key: "yhangmhany", icon: "📶", label: "Yhang Mhany", accent: "#3b82f6", bg: "#0c1e3a", note: "No number check at checkout (Yhang Mhany has no way to verify). Handles unverified numbers on its own end." },
  { key: "auto", icon: "🤖", label: "Auto", accent: "#a855f7", bg: "#1a0c3a", note: "Checkout blocks numbers not on the list. At delivery: Inventor first, then Yhang Mhany if Inventor can't take the number. If neither can, the order fails." },
];

function BalanceDisplay({ bal }: { bal: number | null }) {
  if (bal === null) return <span style={{ color: "#f87171" }}>Unreachable</span>;
  const ok = bal > 50;
  const warn = bal > 0;
  return (
    <span style={{ color: ok ? "#4ade80" : warn ? "#fbbf24" : "#f87171" }}>
      GH₵{bal.toFixed(2)}
      <span className="ml-1 text-xs" style={{ color: ok ? "#4ade80" : warn ? "#fbbf24" : "#f87171" }}>
        {ok ? "OK" : warn ? "LOW" : "EMPTY"}
      </span>
    </span>
  );
}

export default function NetworkProvidersAdmin() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [toast, setToast] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/network-providers").then(r => r.json());
    setData(r);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function switchProvider(provider: MtnProvider) {
    if (!data || data.mtnProvider === provider) return;
    setSwitching(true);
    setData(prev => prev ? { ...prev, mtnProvider: provider } : prev);
    await fetch("/api/admin/network-providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mtnProvider: provider }),
    });
    setSwitching(false);
    setToast(`New MTN orders now go to ${OPTIONS.find(o => o.key === provider)?.label}`);
    setTimeout(() => setToast(""), 3000);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const current = data?.mtnProvider ?? "inventor";

  return (
    <div className="admin-section space-y-5">
      <div>
        <h1 className="text-xl font-black text-white">Network Providers</h1>
        {data?.checkedAt && <p className="mt-1 text-xs text-slate-500">Balances checked {new Date(data.checkedAt).toLocaleTimeString()}</p>}
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          Telecel and AirtelTigo always go through Inventor. This switch controls MTN only, for now.
        </p>
      </div>

      {/* MTN provider switch */}
      <div className="rounded-2xl border p-5" style={{ background: CARD, borderColor: BORDER }}>
        <h2 className="font-bold text-white mb-1">MTN Orders</h2>
        <p className="text-sm mb-5" style={{ color: "#64748b" }}>
          Pick which provider fulfils every new MTN order. Switching takes effect immediately for orders placed after the switch — anything already in flight keeps using whichever provider it started with.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {OPTIONS.map(opt => {
            const active = current === opt.key;
            const bal = opt.key === "inventor" ? data?.inventorBalance ?? null : data?.yhangMhanyBalance ?? null;
            return (
              <button
                key={opt.key}
                onClick={() => switchProvider(opt.key)}
                disabled={switching}
                className="text-left rounded-2xl border p-5 transition disabled:opacity-60"
                style={{
                  background: active ? opt.bg : "#0d1117",
                  borderColor: active ? opt.accent : BORDER,
                  borderWidth: active ? 2 : 1,
                  cursor: switching ? "default" : "pointer",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{opt.icon}</span>
                    <p className="font-bold text-white">{opt.label}</p>
                  </div>
                  {active && (
                    <span className="text-[10px] font-black px-2 py-1 rounded-full" style={{ background: opt.accent, color: "#052e16" }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                {opt.key === "auto" ? (
                  <>
                    <div className="flex justify-between text-sm mb-1">
                      <span style={{ color: "#94a3b8" }}>Inventor</span>
                      <span className="font-black"><BalanceDisplay bal={data?.inventorBalance ?? null} /></span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span style={{ color: "#94a3b8" }}>Yhang Mhany</span>
                      <span className="font-black"><BalanceDisplay bal={data?.yhangMhanyBalance ?? null} /></span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: "#94a3b8" }}>Wallet Balance</span>
                    <span className="font-black"><BalanceDisplay bal={bal} /></span>
                  </div>
                )}
                <p className="text-xs" style={{ color: "#64748b" }}>{opt.note}</p>
              </button>
            );
          })}
        </div>

        <button onClick={load}
          className="mt-5 w-full border font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
          style={{ borderColor: "#1e3a5f", color: "#60a5fa", background: "transparent" }}>
          🔄 Refresh Balances
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-xl font-bold text-sm shadow-lg z-50"
          style={{ background: "#0c2a0c", color: "#4ade80", border: "1px solid #16a34a" }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
