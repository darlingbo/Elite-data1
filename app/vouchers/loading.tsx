const BG     = "#080f1e";
const CARD   = "#0d1b2e";
const BORDER = "#1e3a5f";

function Shimmer({ width = "100%", height = 20, radius = 8 }: { width?: string | number; height?: number; radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: `linear-gradient(90deg, ${CARD} 25%, #112238 50%, ${CARD} 75%)`,
      backgroundSize: "200% 100%",
      animation: "shimmer 1.4s infinite",
    }} />
  );
}

export default function VouchersLoading() {
  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "40px 16px" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <Shimmer width="60%" height={34} radius={10} />
          <div style={{ marginTop: 12 }}><Shimmer width="75%" height={16} radius={6} /></div>
          <div style={{ marginTop: 8 }}><Shimmer width="50%" height={16} radius={6} /></div>
        </div>

        {/* Voucher type cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 24 }}>
              <Shimmer width={48} height={48} radius={14} />
              <div style={{ marginTop: 16 }}><Shimmer width="70%" height={20} radius={6} /></div>
              <div style={{ marginTop: 8 }}><Shimmer width="90%" height={14} radius={4} /></div>
              <div style={{ marginTop: 6 }}><Shimmer width="60%" height={14} radius={4} /></div>
              <div style={{ marginTop: 20 }}><Shimmer height={44} radius={12} /></div>
            </div>
          ))}
        </div>

        {/* Info card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 24 }}>
          <Shimmer width="40%" height={18} radius={6} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <Shimmer width={28} height={28} radius={8} />
              <div style={{ flex: 1 }}>
                <Shimmer width="50%" height={14} radius={4} />
                <div style={{ marginTop: 6 }}><Shimmer width="80%" height={12} radius={4} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

