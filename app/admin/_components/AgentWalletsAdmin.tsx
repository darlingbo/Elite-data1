"use client";
import { useState, useEffect, useRef } from "react";

interface AgentWallet {
  id: string;
  name: string;
  referral_code: string;
  agent_type?: string;
  commission_balance: number;
  wallet_balance: number;
  total_sales: number;
}

interface WalletTx {
  id: string;
  agent_id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

function fmt(n: number) { return `GH₵${Number(n ?? 0).toFixed(2)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  admin_credit:  { label: "Admin Credit",   color: "#22c55e" },
  admin_debit:   { label: "Admin Debit",    color: "#ef4444" },
  paystack_topup:{ label: "Paystack Topup", color: "#3b82f6" },
  order_profit:  { label: "Sale Profit",    color: "#a78bfa" },
  withdrawal:    { label: "Withdrawal",     color: "#f97316" },
};

export default function AgentWalletsAdmin() {
  const [agents, setAgents] = useState<AgentWallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<AgentWallet | null>(null);
  const [modalType, setModalType] = useState<"admin_credit" | "admin_debit">("admin_credit");
  const [modalAmount, setModalAmount] = useState("");
  const [modalNote, setModalNote] = useState("");
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const mutationKey = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/agent-wallets");
    const json = await res.json();
    setAgents(json.agents ?? []);
    setTransactions(json.transactions ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }

  async function handleSave() {
    if (!modal) return;
    const amt = parseFloat(modalAmount);
    if (isNaN(amt) || amt <= 0) return showToast("❌ Enter a valid amount");
    mutationKey.current ??= crypto.randomUUID();
    setSaving(true);
    const res = await fetch("/api/admin/agent-wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": mutationKey.current,
      },
      body: JSON.stringify({ agentId: modal.id, type: modalType, amount: amt, description: modalNote || undefined }),
    });
    setSaving(false);
    const j = await res.json();
    if (res.ok) {
      mutationKey.current = null;
      showToast(`✅ ${modalType === "admin_credit" ? "Credited" : "Debited"} GH₵${amt.toFixed(2)} ${modalType === "admin_credit" ? "to" : "from"} ${modal.name}`);
      setModal(null);
      setModalAmount("");
      setModalNote("");
      load();
    } else {
      showToast(`❌ ${j.error}`);
    }
  }

  const filtered = agents.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.referral_code.toLowerCase().includes(search.toLowerCase())
  );

  const agentTxs = selectedAgent ? transactions.filter(t => t.agent_id === selectedAgent) : [];

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="admin-section space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-semibold">
          {toast}
        </div>
      )}

      {/* Credit/Debit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1f3d] border border-[#1e3050] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-1">Adjust Wallet</h3>
            <p className="text-blue-300 font-semibold mb-5">{modal.name} <span className="text-slate-500 font-normal text-sm">({modal.referral_code})</span></p>

            <div className="flex gap-2 mb-4">
              {(["admin_credit", "admin_debit"] as const).map(t => (
                <button key={t} onClick={() => setModalType(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${modalType === t ? (t === "admin_credit" ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white") : "bg-slate-800 border-slate-600 text-slate-400"}`}>
                  {t === "admin_credit" ? "➕ Credit" : "➖ Debit"}
                </button>
              ))}
            </div>

            <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-semibold">Amount (GH₵)</p>
            <input
              type="number" min="0.01" step="0.01" value={modalAmount}
              onChange={e => setModalAmount(e.target.value)}
              placeholder="e.g. 100"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-3 outline-none focus:border-blue-500"
            />

            <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-semibold">Note (optional)</p>
            <input
              value={modalNote}
              onChange={e => setModalNote(e.target.value)}
              placeholder={modalType === "admin_credit" ? "e.g. MoMo received" : "e.g. Correction"}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-5 outline-none focus:border-blue-500"
            />

            <div className="flex gap-3">
              <button onClick={() => { setModal(null); setModalAmount(""); setModalNote(""); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 text-sm font-semibold">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-60 ${modalType === "admin_credit" ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}>
                {saving ? "Saving…" : modalType === "admin_credit" ? "Credit Wallet" : "Debit Wallet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { label: "Total Wallet Deposits", value: agents.reduce((s, a) => s + (a.wallet_balance ?? 0), 0), color: "#3b82f6" },
          { label: "Total Commissions Owed", value: agents.reduce((s, a) => s + (a.commission_balance ?? 0), 0), color: "#a78bfa" },
          { label: "Total Withdrawable", value: agents.reduce((s, a) => s + (a.wallet_balance ?? 0) + (a.commission_balance ?? 0), 0), color: "#22c55e" },
        ].map(c => (
          <div key={c.label} className="bg-[#0b1829] border border-[#1e3050] rounded-xl p-4 text-center">
            <p className="text-2xl font-black" style={{ color: c.color }}>{fmt(c.value)}</p>
            <p className="text-slate-500 text-xs mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Agent list */}
      <div className="bg-[#0b1829] border border-[#1e3050] rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-[#1e3050] flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-white font-bold text-base">Agent Wallets</h3>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-base sm:w-48 sm:py-2 sm:text-sm outline-none focus:border-blue-500 w-full"
          />
        </div>

        <div className="divide-y divide-[#1e3050]">
          {filtered.map(agent => {
            const withdrawable = (agent.wallet_balance ?? 0) + (agent.commission_balance ?? 0);
            return (
              <div key={agent.id}>
                <div className="grid grid-cols-[auto_1fr] items-center gap-3 px-4 py-4 sm:flex sm:gap-4 sm:px-5">
                  <div className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center font-bold text-blue-300 text-sm flex-shrink-0">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{agent.name}</p>
                    <p className="text-slate-500 text-xs">{agent.referral_code} · {agent.total_sales} sales</p>
                  </div>

                  <div className="col-span-2 grid w-full grid-cols-3 gap-2 rounded-xl bg-black/15 p-3 text-center sm:ml-auto sm:mr-4 sm:w-auto sm:gap-4 sm:bg-transparent sm:p-0 sm:text-right">
                    <div>
                      <p className="text-blue-400 font-bold text-sm">{fmt(agent.wallet_balance ?? 0)}</p>
                      <p className="text-slate-600 text-xs">Deposit</p>
                    </div>
                    <div>
                      <p className="text-purple-400 font-bold text-sm">{fmt(agent.commission_balance ?? 0)}</p>
                      <p className="text-slate-600 text-xs">Commission</p>
                    </div>
                    <div>
                      <p className="text-green-400 font-bold text-sm">{fmt(withdrawable)}</p>
                      <p className="text-slate-600 text-xs">Withdrawable</p>
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-3 gap-2 sm:flex sm:flex-shrink-0">
                    <button onClick={() => { setSelectedAgent(selectedAgent === agent.id ? null : agent.id); }}
                      className="px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs font-semibold rounded-lg">
                      {selectedAgent === agent.id ? "Hide" : "History"}
                    </button>
                    <button onClick={() => { setModal(agent); setModalType("admin_credit"); setModalAmount(""); setModalNote(""); }}
                      className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 text-green-300 text-xs font-semibold rounded-lg">
                      ➕ Credit
                    </button>
                    <button onClick={() => { setModal(agent); setModalType("admin_debit"); setModalAmount(""); setModalNote(""); }}
                      className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 text-xs font-semibold rounded-lg">
                      ➖ Debit
                    </button>
                  </div>
                </div>

                {/* Transaction history for this agent */}
                {selectedAgent === agent.id && (
                  <div className="bg-[#060f1e] border-t border-[#1e3050] px-5 py-4">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Transaction History</p>
                    {agentTxs.length === 0 ? (
                      <p className="text-slate-600 text-sm text-center py-4">No transactions yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {agentTxs.map(tx => {
                          const meta = TYPE_LABELS[tx.type] ?? { label: tx.type, color: "#94a3b8" };
                          const isCredit = ["admin_credit", "paystack_topup", "order_profit"].includes(tx.type);
                          return (
                            <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-[#1a2a45] last:border-0">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                              <div className="flex-1">
                                <p className="text-white text-xs font-semibold">{meta.label}</p>
                                {tx.description && <p className="text-slate-500 text-xs">{tx.description}</p>}
                              </div>
                              <p className="text-xs font-bold" style={{ color: isCredit ? "#22c55e" : "#ef4444" }}>
                                {isCredit ? "+" : "-"}{fmt(tx.amount)}
                              </p>
                              <p className="text-slate-600 text-xs">{fmtDate(tx.created_at)}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No agents found.</p>}
        </div>
      </div>
    </div>
  );
}
