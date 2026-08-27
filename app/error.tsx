"use client";

import { useEffect } from "react";
import Link from "next/link";

const BG     = "#080f1e";
const CARD   = "#0d1b2e";
const BORDER = "#1e3a5f";
const TEXT   = "#f8fafc";
const MUTED  = "#94a3b8";
const YELLOW = "#fbbf24";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console so it shows in Vercel function logs
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: BG }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px" }}>
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>⚠️</div>

            <div style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 20,
              padding: "32px 28px",
              marginBottom: 24,
            }}>
              <h1 style={{ color: TEXT, fontWeight: 800, fontSize: 22, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
                Something went wrong
              </h1>
              <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.65, margin: "0 0 24px" }}>
                We hit an unexpected error. Don&apos;t worry — your payment data is safe.
                Try refreshing, or contact us on WhatsApp if this keeps happening.
              </p>

              {error?.digest && (
                <p style={{ color: "#475569", fontSize: 11, fontFamily: "monospace", margin: "0 0 20px", wordBreak: "break-all" }}>
                  Error ID: {error.digest}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={reset}
                  style={{
                    background: YELLOW, color: "#0d0d0d", fontWeight: 800,
                    padding: "12px 22px", borderRadius: 12, border: "none",
                    cursor: "pointer", fontSize: 14,
                  }}
                >
                  🔄 Try Again
                </button>
                <Link
                  href="/"
                  style={{
                    display: "inline-flex", alignItems: "center",
                    background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`,
                    color: TEXT, fontWeight: 600, padding: "12px 22px",
                    borderRadius: 12, textDecoration: "none", fontSize: 14,
                  }}
                >
                  🏠 Go Home
                </Link>
              </div>
            </div>

            <a
              href="https://wa.me/233509794503"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                color: "#4ade80", fontWeight: 600, fontSize: 13, textDecoration: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.526 5.845L.057 23.882l6.174-1.447A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-5.003-1.372l-.36-.213-3.664.86.902-3.559-.234-.375A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
              </svg>
              Need help? Chat on WhatsApp
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

