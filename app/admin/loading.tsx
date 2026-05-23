export default function AdminLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "#0d1424", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <div style={{ width: "40px", height: "40px", border: "4px solid #1e3050", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#475569", fontSize: "14px", fontWeight: 600 }}>Loading dashboard…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
