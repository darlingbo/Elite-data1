export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0f1e 0%, #0d1b2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>🔧</div>
        <h1
          style={{
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 900,
            marginBottom: 12,
            letterSpacing: "-0.02em",
          }}
        >
          We&apos;ll be right back
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
          Elite Data is currently undergoing scheduled maintenance to improve
          your experience. We&apos;ll be back online shortly.
        </p>
        <div
          style={{
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 16,
            padding: "16px 24px",
            marginBottom: 32,
          }}
        >
          <p style={{ color: "#93c5fd", fontSize: 14, fontWeight: 600, margin: 0 }}>
            Need help? Contact us on WhatsApp
          </p>
        </div>
        <p style={{ color: "#475569", fontSize: 13 }}>
          &copy; {new Date().getFullYear()} Elite Data Ghana
        </p>
      </div>
    </div>
  );
}
