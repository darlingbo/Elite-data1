"use client";

import { useEffect, useState } from "react";

type SubAdmin = {
  id: string; name: string; email: string; status: string;
  can_approve_orders: boolean; permissions: Permissions; agent_id: string; master_commission_rate: number; last_login_at: string | null;
};
type Permissions = { view_agents: boolean; view_orders: boolean; view_finance: boolean; view_customer_contacts: boolean; approve_orders: boolean; download_reports: boolean };
const defaultPermissions: Permissions = { view_agents: true, view_orders: true, view_finance: false, view_customer_contacts: true, approve_orders: false, download_reports: false };
type Agent = {
  id: string; name: string; email: string; referral_code: string;
  status: string; plan: "free" | "pro"; sub_admin_id: string | null;
};
type Transfer = { id: string; agent_id: string; created_at: string; agents?: { name?: string } | { name?: string }[]; sub_admins?: { name?: string } | { name?: string }[] };

export default function SubAdminsManagementPage() {
  const [subAdmins, setSubAdmins] = useState<SubAdmin[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({ agentId: "", password: "", masterCommissionRate: 0, permissions: defaultPermissions });
  const [newPassword, setNewPassword] = useState("");
  const [selected, setSelected] = useState<SubAdmin | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState({ adminEarnings: 0, subAdminEarnings: 0, reversedAdminEarnings: 0, transactions: 0 });
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  async function load() {
    setLoading(true);
    const [response, earningsResponse, transfersResponse] = await Promise.all([fetch("/api/admin/sub-admins", { cache: "no-store" }), fetch("/api/admin/team-earnings", { cache: "no-store" }), fetch("/api/admin/team-transfers", { cache: "no-store" })]);
    const [data, earningsData, transfersData] = await Promise.all([response.json(), earningsResponse.json(), transfersResponse.json()]);
    if (response.ok) {
      setSubAdmins(data.subAdmins ?? []);
      setAgents(data.agents ?? []);
      if (earningsResponse.ok) setEarnings(earningsData.summary ?? earnings);
      if (transfersResponse.ok) setTransfers(transfersData.transfers ?? []);
    } else setMessage(data.error ?? "Could not load sub-admins.");
    setLoading(false);
  }

  async function decideTransfer(requestId: string, action: "approve" | "decline") {
    const response = await fetch("/api/admin/team-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }) });
    const data = await response.json(); setMessage(response.ok ? `Transfer ${action}d.` : data.error ?? "Could not decide transfer."); if (response.ok) await load();
  }

  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/sub-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Could not create sub-admin.");
    setForm({ agentId: "", password: "", masterCommissionRate: 0, permissions: defaultPermissions });
    setMessage("Sub-admin created.");
    await load();
  }

  function open(admin: SubAdmin) {
    setSelected(admin);
    setAssigned(agents.filter(agent => agent.sub_admin_id === admin.id).map(agent => agent.id));
    setMessage("");
  }

  async function save() {
    if (!selected) return;
    const response = await fetch("/api/admin/sub-admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        status: selected.status,
        permissions: selected.permissions,
        masterCommissionRate: selected.master_commission_rate,
        agentIds: assigned,
        password: newPassword || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Could not save assignments.");
    setMessage("Permissions and agent assignments saved.");
    setNewPassword("");
    await load();
  }

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-7">
          <div>
            <p className="text-blue-400 text-xs font-black tracking-[.2em] uppercase">Owner controls</p>
            <h1 className="text-3xl font-black">Sub-admins & Agent Teams</h1>
            <p className="text-slate-500 mt-1">Create restricted managers and place agents under them.</p>
          </div>
          <a href="/admin" className="px-4 py-2 rounded-xl bg-slate-800 text-sm font-bold">← Dashboard</a>
        </div>

        {message && <div className="mb-5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-blue-200">{message}</div>}

        <div className="grid sm:grid-cols-4 gap-3 mb-6">{[["Your 10% earnings", earnings.adminEarnings], ["Pro agents' 20%", earnings.subAdminEarnings], ["Reversed", earnings.reversedAdminEarnings], ["Commission sales", earnings.transactions]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-slate-800 bg-[#0d1525] p-4"><p className="text-xs text-slate-500">{label}</p><strong className="text-xl">{label === "Commission sales" ? value : `GH₵${Number(value).toFixed(2)}`}</strong></div>)}</div>

        {transfers.length > 0 && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 mb-6"><h2 className="font-black mb-3">Transfers awaiting your approval</h2>{transfers.map(transfer => { const agent = Array.isArray(transfer.agents) ? transfer.agents[0] : transfer.agents; const team = Array.isArray(transfer.sub_admins) ? transfer.sub_admins[0] : transfer.sub_admins; return <div key={transfer.id} className="flex flex-wrap justify-between items-center gap-3 border-t border-slate-800 py-3"><span><b>{agent?.name ?? "Agent"}</b> → {team?.name ?? "Pro team"}<small className="block text-slate-500">Agent already consented</small></span><span className="flex gap-2"><button onClick={() => decideTransfer(transfer.id, "approve")} className="rounded-lg bg-green-600 px-3 py-2 font-bold">Approve</button><button onClick={() => decideTransfer(transfer.id, "decline")} className="rounded-lg bg-red-600 px-3 py-2 font-bold">Decline</button></span></div>; })}</section>}

        <div className="grid lg:grid-cols-[360px_1fr] gap-6">
          <section className="rounded-2xl border border-slate-800 bg-[#0d1525] p-5 h-fit">
            <h2 className="font-black text-lg mb-1">Activate Pro Master Agent</h2>
            <p className="text-xs text-slate-500 mb-4">Only approved Pro agents can receive a team dashboard.</p>
            <form onSubmit={create} className="space-y-3">
              <select required value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })} className="w-full rounded-xl bg-[#080f1c] border border-slate-700 px-4 py-3"><option value="">Select approved Pro agent</option>{agents.filter(a => a.plan === "pro" && a.status === "approved" && !subAdmins.some(s => s.agent_id === a.id)).map(a => <option key={a.id} value={a.id}>{a.name} · {a.referral_code}</option>)}</select>
              <input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Temporary password" className="w-full rounded-xl bg-[#080f1c] border border-slate-700 px-4 py-3" />
              <label className="block text-xs text-slate-400">Team commission (% of sub-agent commission)<input type="number" min={0} max={100} step="0.01" value={form.masterCommissionRate} onChange={e => setForm({ ...form, masterCommissionRate: Number(e.target.value) })} className="mt-1 w-full rounded-xl bg-[#080f1c] border border-slate-700 px-4 py-3" /></label>
              <p className="text-xs text-slate-500">You create the login and give the email and temporary password directly to the staff member.</p>
              {Object.entries({ view_agents: "View assigned agents", view_orders: "View team orders", view_finance: "View amounts and finance", view_customer_contacts: "View phone and contact details", approve_orders: "Approve assigned-agent orders", download_reports: "Download team reports" }).map(([key,label]) => <label key={key} className="flex items-start gap-3 text-sm text-slate-300"><input type="checkbox" checked={form.permissions[key as keyof Permissions]} onChange={e => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })} className="mt-1" />{label}</label>)}
              <button className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 font-black">Activate Master Agent</button>
            </form>
            <p className="text-center text-xs text-slate-500 mt-4">Pro masters use their normal Agent Dashboard login.</p>
          </section>

          <section>
            {loading ? <p className="text-slate-500">Loading…</p> : (
              <div className="grid sm:grid-cols-2 gap-4">
                {subAdmins.map(admin => (
                  <button key={admin.id} onClick={() => open(admin)} className="text-left rounded-2xl border border-slate-800 bg-[#0d1525] p-5 hover:border-blue-500/50">
                    <div className="flex justify-between gap-3">
                      <div><h3 className="font-black">{admin.name}</h3><p className="text-sm text-slate-500">{admin.email}</p></div>
                      <span className={`text-xs font-black px-2 py-1 rounded-lg h-fit ${admin.status === "active" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{admin.status}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-4">{agents.filter(agent => agent.sub_admin_id === admin.id).length} assigned agents</p>
                    <p className="text-xs text-emerald-400 mt-1">{Number(admin.master_commission_rate || 0).toFixed(2)}% team commission</p>
                    <p className="text-xs text-slate-600 mt-1">{admin.permissions?.approve_orders ? "Order approval enabled" : "No order approval"} · Last login: {admin.last_login_at ? new Date(admin.last_login_at).toLocaleString("en-GH") : "Never"}</p>
                  </button>
                ))}
                {!subAdmins.length && <p className="text-slate-500">No sub-admins created yet.</p>}
              </div>
            )}
          </section>
        </div>

        {selected && (
          <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center" onClick={() => setSelected(null)}>
            <section className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-700 bg-[#0d1525] p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between mb-5"><div><h2 className="text-xl font-black">{selected.name}</h2><p className="text-slate-500 text-sm">{selected.email}</p></div><button onClick={() => setSelected(null)}>✕</button></div>
              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <label className="rounded-xl bg-slate-900 p-3 text-sm"><span className="block text-slate-500 mb-2">Account status</span><select value={selected.status} onChange={e => setSelected({ ...selected, status: e.target.value })} className="w-full bg-transparent"><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
                <label className="rounded-xl bg-slate-900 p-3 text-sm"><span className="block text-slate-500 mb-2">Set a new temporary password</span><input minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full bg-transparent outline-none" /></label>
              </div>
              <h3 className="font-black mb-3">Permissions</h3>
              <div className="grid sm:grid-cols-2 gap-2 mb-5">{Object.entries({ view_agents: "View assigned agents", view_orders: "View team orders", view_finance: "View finance", view_customer_contacts: "View contacts", approve_orders: "Approve orders", download_reports: "Download reports" }).map(([key,label]) => <label key={key} className="rounded-xl border border-slate-800 p-3 text-sm flex gap-3"><input type="checkbox" checked={selected.permissions?.[key as keyof Permissions] ?? defaultPermissions[key as keyof Permissions]} onChange={e => setSelected({ ...selected, permissions: { ...(selected.permissions ?? defaultPermissions), [key]: e.target.checked } })} />{label}</label>)}</div>
              <label className="block rounded-xl bg-slate-900 p-3 text-sm mb-5"><span className="block text-slate-500 mb-2">Team commission rate (%)</span><input type="number" min={0} max={100} step="0.01" value={selected.master_commission_rate} onChange={e => setSelected({ ...selected, master_commission_rate: Number(e.target.value) })} className="w-full bg-transparent outline-none" /></label>
              <h3 className="font-black mb-3">Agents under this sub-admin</h3>
              <div className="space-y-2">
                {agents.filter(agent => agent.id !== selected.agent_id && !subAdmins.some(master => master.agent_id === agent.id)).map(agent => {
                  const ownedElsewhere = !!agent.sub_admin_id && agent.sub_admin_id !== selected.id;
                  return <label key={agent.id} className={`flex gap-3 rounded-xl border border-slate-800 p-3 ${ownedElsewhere ? "opacity-50" : ""}`}>
                    <input type="checkbox" disabled={ownedElsewhere} checked={assigned.includes(agent.id)} onChange={e => setAssigned(e.target.checked ? [...assigned, agent.id] : assigned.filter(id => id !== agent.id))} />
                    <span><span className="font-bold">{agent.name}</span><span className="block text-xs text-slate-500">{agent.referral_code} · {agent.status}{ownedElsewhere ? " · assigned to another sub-admin" : ""}</span></span>
                  </label>;
                })}
              </div>
              <button onClick={save} className="w-full mt-5 rounded-xl bg-blue-600 py-3 font-black">Save team & permissions</button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
