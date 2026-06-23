"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AgentStorefront from "@/components/AgentStorefront";

interface AgentInfo {
  name: string;
  whatsapp: string;
  shop_name: string | null;
  agent_type: string | null;
}

export interface AgentSession {
  id: string;
  referralCode: string;
  walletBalance: number;
  name: string;
}

export default function ShopPage() {
  const params = useParams();
  const code = (params.code as string ?? "").toUpperCase();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/agents/info?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setAgent(d);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true));

    // Restore session from localStorage
    try {
      const saved = localStorage.getItem(`agent_shop_session_${code}`);
      if (saved) {
        const parsed = JSON.parse(saved) as AgentSession;
        if (parsed.id && parsed.referralCode === code) setAgentSession(parsed);
      }
    } catch {}
  }, [code]);

  function handleLogin(session: AgentSession) {
    setAgentSession(session);
    setShowLogin(false);
    try {
      localStorage.setItem(`agent_shop_session_${code}`, JSON.stringify(session));
    } catch {}
  }

  function handleLogout() {
    setAgentSession(null);
    try { localStorage.removeItem(`agent_shop_session_${code}`); } catch {}
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-6xl mb-4">🔍</p>
          <h1 className="text-2xl font-black text-gray-800 mb-2">Store Not Found</h1>
          <p className="text-gray-500 mb-6">The agent link <strong>{code}</strong> doesn&apos;t exist or is no longer active.</p>
          <a href="/" className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors">
            Buy Directly from Elite Data
          </a>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const shopName = agent.shop_name || agent.name;

  return (
    <>
      <AgentStorefront
        shopName={shopName}
        agentName={agent.name}
        agentWhatsapp={agent.whatsapp}
        agentCode={code}
        agentSession={agentSession}
        onAgentLoginRequest={() => setShowLogin(true)}
        onAgentLogout={handleLogout}
        onWalletBalanceChange={(bal) => setAgentSession(s => s ? { ...s, walletBalance: bal } : s)}
      />
      {showLogin && (
        <AgentShopLoginModal
          shopCode={code}
          onSuccess={handleLogin}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

function AgentShopLoginModal({
  shopCode,
  onSuccess,
  onClose,
}: {
  shopCode: string;
  onSuccess: (session: AgentSession) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/agents/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await res.json();
      if (!res.ok || !d.agent) { setError(d.error ?? "Login failed."); return; }
      const a = d.agent;
      if (a.referral_code !== shopCode) {
        setError("This is not your shop. Log in with the account that owns this link.");
        return;
      }
      onSuccess({
        id: a.id,
        referralCode: a.referral_code,
        walletBalance: a.wallet_balance ?? 0,
        name: a.name,
      });
    } catch { setError("Network error. Try again."); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <button onClick={onClose} style={{ float: "right", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        <p style={{ fontWeight: 900, fontSize: 18, color: "#1e293b", margin: "0 0 4px" }}>Agent Login</p>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>Log in to use your wallet balance on this shop.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", fontSize: 15, outline: "none", color: "#1e293b" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", fontSize: 15, outline: "none", color: "#1e293b" }}
          />
          {error && <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, margin: 0 }}>{error}</p>}
          <button
            onClick={login}
            disabled={loading}
            style={{ background: "linear-gradient(90deg,#3b82f6,#7c3aed)", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Logging in…" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
