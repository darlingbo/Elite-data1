"use client";
import { useState } from "react";
import { CARD, BORDER, BG } from "./shared/constants";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg("");
    if (next.length < 8) { setMsg("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setMsg("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const d = await res.json();
      if (d.success) { setOk(true); setMsg("Password changed successfully!"); } else setMsg(d.error || "Failed.");
    } catch { setMsg("Network error."); } finally { setLoading(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 border" style={{ background: CARD, borderColor: BORDER }}>
        <h3 className="font-black text-white text-lg mb-1">Change Password</h3>
        <p className="text-xs text-slate-500 mb-5">You&apos;ll use the new password next time you log in.</p>
        {ok ? <div className="text-center py-4"><p className="text-green-400 font-bold text-sm mb-4">✅ Password updated!</p><button onClick={onClose} className="text-sm text-slate-400 hover:text-white">Close</button></div> : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {[["Current Password", current, setCurrent], ["New Password (min 8 chars)", next, setNext], ["Confirm New Password", confirm, setConfirm]].map(([label, val, set]) => (
              <div key={label as string}>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{label as string}</label>
                <input type="password" value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)} required className="w-full rounded-lg px-3 py-2.5 text-sm text-white border focus:outline-none focus:border-blue-500" style={{ background: BG, borderColor: BORDER }} />
              </div>
            ))}
            {msg && <p className="text-xs font-semibold text-red-400">{msg}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 border text-slate-400 font-semibold py-2.5 rounded-xl text-sm hover:text-white" style={{ borderColor: BORDER }}>Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-60" style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}>{loading ? "Saving…" : "Change Password"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
