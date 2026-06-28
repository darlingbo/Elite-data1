"use client";
import { useState } from "react";

export default function AdminResetPassword() {
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [done, setDone]               = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!resetToken.trim())       return setError("Enter your ADMIN_SESSION_TOKEN from Vercel.");
    if (newPassword.length < 6)   return setError("Password must be at least 6 characters.");
    if (newPassword !== confirm)  return setError("Passwords do not match.");

    setLoading(true);
    try {
      const res  = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: resetToken.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.success) setDone(true);
      else setError(data.error || "Reset failed.");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#080f1e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#16a34a,#4ade80)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>✓</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", margin: "0 0 8px" }}>Password Reset!</h1>
          <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 28px" }}>Your new admin password is saved. You can now log in.</p>
          <a href="/admin" style={{ display: "inline-block", background: "linear-gradient(90deg,#2563eb,#1d4ed8)", color: "white", textDecoration: "none", borderRadius: 14, padding: "13px 32px", fontSize: 15, fontWeight: 800 }}>
            Go to Admin Login →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080f1e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>🔑</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", margin: "0 0 6px" }}>Reset Admin Password</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Use your session token from Vercel to prove it&apos;s you</p>
        </div>

        {/* How-to box */}
        <div style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", margin: "0 0 6px" }}>How to find your reset token:</p>
          <ol style={{ fontSize: 12, color: "#94a3b8", margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Go to <b style={{ color: "#f8fafc" }}>vercel.com</b> → your project</li>
            <li>Click <b style={{ color: "#f8fafc" }}>Settings → Environment Variables</b></li>
            <li>Find <code style={{ color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "1px 5px", borderRadius: 4 }}>ADMIN_SESSION_TOKEN</code> and copy the value</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, padding: "10px 14px", borderRadius: 10, fontWeight: 600 }}>{error}</div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              ADMIN_SESSION_TOKEN <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="password"
              placeholder="Paste your session token here"
              value={resetToken}
              onChange={e => { setResetToken(e.target.value); setError(""); }}
              style={{ width: "100%", background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 10, padding: "11px 14px", color: "#f8fafc", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              New Password <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError(""); }}
                style={{ width: "100%", background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 10, padding: "11px 40px 11px 14px", color: "#f8fafc", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>
                {showPw ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Confirm New Password <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Repeat new password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(""); }}
              style={{ width: "100%", background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 10, padding: "11px 14px", color: "#f8fafc", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ background: loading ? "#475569" : "linear-gradient(90deg,#2563eb,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}
          >
            {loading ? "Saving…" : "Reset Password →"}
          </button>
        </form>

        <p style={{ textAlign: "center", color: "#475569", fontSize: 12, marginTop: 20 }}>
          Remember your password? <a href="/admin" style={{ color: "#3b82f6", fontWeight: 700 }}>Back to login →</a>
        </p>
      </div>
    </div>
  );
}
