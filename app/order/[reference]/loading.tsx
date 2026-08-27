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

export default function OrderLoading() {
  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "40px 16px" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}><Shimmer width={120} height={16} radius={4} /></div>

        {/* Status banner */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "28px 24px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <Shimmer width={64} height={64} radius={32} />
          </div>
          <Shimmer width="50%" height={24} radius={6} />
          <div style={{ marginTop: 12 }}><Shimmer width="80%" height={14} radius={4} /></div>
        </div>

        {/* Details card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "20px 20px 16px", marginBottom: 16 }}>
          <Shimmer width="35%" height={12} radius={4} />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 5 ? `1px solid ${BORDER}` : "none" }}>
              <Shimmer width="30%" height={14} radius={4} />
              <Shimmer width="40%" height={14} radius={4} />
            </div>
          ))}
        </div>

        <Shimmer height={48} radius={14} />
      </div>
    </div>
  );
}

