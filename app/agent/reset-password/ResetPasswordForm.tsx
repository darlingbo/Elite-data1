"use client";

import { useState } from "react";
import Link from "next/link";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Password must be at least 8 characters.");
    if (password !== confirm) return setMessage("Passwords do not match.");
    setLoading(true);
    const response = await fetch("/api/agents/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await response.json();
    setLoading(false);
    setMessage(body.error ?? "Password changed successfully.");
    setDone(response.ok);
  }

  return (
    <main className="min-h-screen bg-[#080f1e] flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl bg-[#0d1b2e] border border-[#1e3a5f] p-7 text-white">
        <h1 className="text-2xl font-black mb-2">Reset agent password</h1>
        <p className="text-slate-400 text-sm mb-6">Choose a new password for your Elite Data agent account.</p>
        {done ? (
          <div>
            <p className="text-green-400 mb-5">{message}</p>
            <Link className="block text-center bg-yellow-400 text-black font-bold rounded-xl py-3" href="/agent/dashboard">Sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input className="w-full rounded-xl bg-[#080f1e] border border-[#29466d] p-3" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" required />
            <input className="w-full rounded-xl bg-[#080f1e] border border-[#29466d] p-3" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" autoComplete="new-password" required />
            {message && <p className="text-red-400 text-sm">{message}</p>}
            <button className="w-full bg-yellow-400 text-black font-bold rounded-xl py-3 disabled:opacity-50" disabled={loading || !token}>{loading ? "Updating…" : "Update password"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
