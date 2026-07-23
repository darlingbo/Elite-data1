"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Stage = "checking" | "biometric" | "password" | "registering";

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export default function AdminLogin() {
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registerPrompt, setRegisterPrompt] = useState(false);
  const router = useRouter();

  // On mount: check if biometric credential is registered
  useEffect(() => {
    async function check() {
      if (!window.PublicKeyCredential) { setStage("password"); return; }
      try {
        const r = await fetch("/api/admin/biometric?action=has-credentials");
        const d = await r.json();
        setStage(d.registered ? "biometric" : "password");
      } catch {
        setStage("password");
      }
    }
    check();
  }, []);

  async function handleBiometric() {
    setLoading(true);
    setError("");
    try {
      // Get authentication options
      const optRes = await fetch("/api/admin/biometric?action=authentication-options");
      if (!optRes.ok) { setError("Could not load biometric options."); setLoading(false); return; }
      const options = await optRes.json();

      // Convert challenge + allowCredentials from base64url to ArrayBuffer
      const publicKey: PublicKeyCredentialRequestOptions = {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        allowCredentials: (options.allowCredentials ?? []).map((c: { id: string; type: string; transports?: string[] }) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      };

      const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
      if (!assertion) { setError("Biometric cancelled."); setLoading(false); return; }

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
      const body = {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
          authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
          signature: bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
        },
      };

      const verifyRes = await fetch("/api/admin/biometric?action=authentication-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await verifyRes.json();
      if (result.success) { router.push("/admin"); }
      else { setError(result.error ?? "Biometric failed. Try password instead."); }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cancel") || msg.includes("abort") || msg.includes("NotAllowed")) {
        setError("Cancelled. Try again or use password.");
      } else {
        setError("Fingerprint not set up on this device. Log in with password, then set up fingerprint from admin settings.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        // Offer to set up biometric if not registered and device supports it
        if (window.PublicKeyCredential) {
          const checkRes = await fetch("/api/admin/biometric?action=has-credentials");
          const checkData = await checkRes.json();
          if (!checkData.registered) {
            setRegisterPrompt(true);
            setLoading(false);
            return;
          }
        }
        router.push("/admin");
      } else {
        setError(data.error || "Incorrect password.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterBiometric() {
    setLoading(true);
    setError("");
    try {
      const optRes = await fetch("/api/admin/biometric?action=registration-options");
      if (!optRes.ok) { setError("Could not load registration options."); setLoading(false); return; }
      const options = await optRes.json();

      const publicKey: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        user: { ...options.user, id: base64urlToBuffer(options.user.id) },
        excludeCredentials: (options.excludeCredentials ?? []).map((c: { id: string; type: string; transports?: string[] }) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      };

      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      if (!credential) { setLoading(false); router.push("/admin"); return; }

      const attestationResponse = credential.response as AuthenticatorAttestationResponse;
      const body = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(attestationResponse.clientDataJSON),
          attestationObject: bufferToBase64url(attestationResponse.attestationObject),
          transports: attestationResponse.getTransports?.() ?? [],
        },
      };

      const verifyRes = await fetch("/api/admin/biometric?action=registration-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await verifyRes.json();
      if (result.success) { router.push("/admin"); }
      else { setError(result.error ?? "Registration failed."); router.push("/admin"); }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancel") && !msg.includes("abort") && !msg.includes("NotAllowed")) {
        setError("Setup failed — you can set it up later from admin settings.");
      }
      router.push("/admin");
    } finally {
      setLoading(false);
    }
  }

  if (stage === "checking") {
    return (
      <div className="admin-login min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="admin-login min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: "linear-gradient(145deg,#2563eb,#0ea5e9)", boxShadow: "0 14px 38px rgba(37,99,235,0.32)" }}>
            <span className="text-white font-black text-xl">E</span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400 mb-2">Secure Control Center</p>
          <h1 className="text-2xl font-black text-white">Admin Access</h1>
          <p className="text-slate-500 text-sm mt-1">Elite Data Dashboard</p>
        </div>

        <div className="admin-login-card rounded-2xl border p-5 sm:p-6">

          {/* Register biometric prompt (shown after successful password login) */}
          {registerPrompt ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
              <div style={{ fontSize: 48 }}>🔐</div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Set up Fingerprint Login?</h2>
              <p style={{ fontSize: 14, color: "#666", margin: 0, lineHeight: 1.5 }}>
                Next time you can log in with just your fingerprint, Face ID, or phone lock — no password needed.
              </p>
              {error && <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{error}</p>}
              <button
                onClick={handleRegisterBiometric}
                disabled={loading}
                style={{
                  background: "#2563eb", color: "white", border: "none", borderRadius: 14,
                  padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Setting up…" : "Yes — Set Up Fingerprint"}
              </button>
              <button
                onClick={() => router.push("/admin")}
                style={{
                  background: "none", color: "#999", border: "none", fontSize: 14,
                  cursor: "pointer", padding: "8px",
                }}
              >
                Skip for now
              </button>
            </div>
          ) : stage === "biometric" ? (
            /* Biometric login screen */
            <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
              <div style={{ fontSize: 56, lineHeight: 1 }}>👆</div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Touch to Unlock</h2>
              <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
                Use your fingerprint, Face ID, or phone PIN to sign in
              </p>
              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px" }}>
                  <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{error}</p>
                </div>
              )}
              <button
                onClick={handleBiometric}
                disabled={loading}
                style={{
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  color: "white", border: "none", borderRadius: 14,
                  padding: "16px", fontSize: 16, fontWeight: 800, cursor: "pointer",
                  opacity: loading ? 0.6 : 1, boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                }}
              >
                {loading ? "Verifying…" : "Unlock with Biometrics"}
              </button>
              <button
                onClick={() => setStage("password")}
                style={{ background: "none", color: "#999", border: "none", fontSize: 13, cursor: "pointer", padding: "4px" }}
              >
                Use password instead
              </button>
            </div>
          ) : (
            /* Password login screen */
            <form onSubmit={handlePassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  className="w-full border rounded-xl bg-[#080f1c] px-3.5 py-3 text-base text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="Enter admin password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors text-sm shadow-lg shadow-blue-950/40"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
              {stage === "password" && (
                <button
                  type="button"
                  onClick={() => setStage("biometric")}
                  style={{ background: "none", color: "#999", border: "none", fontSize: 13, cursor: "pointer", padding: "4px" }}
                >
                  Use fingerprint instead
                </button>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-5">Protected session · Expires after 5 hours</p>
      </div>
    </div>
  );
}
