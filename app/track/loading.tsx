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

export default function TrackLoading() {
  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "40px 16px" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <Shimmer width="50%" height={30} radius={8} />
          <div style={{ marginTop: 10 }}><Shimmer width="65%" height={15} radius={5} /></div>
        </div>

        {/* Search bar */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <Shimmer height={48} radius={12} />
          <div style={{ marginTop: 12 }}><Shimmer height={48} radius={12} /></div>
        </div>

        {/* Result card placeholder */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 24 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <Shimmer width={64} height={64} radius={32} />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 4 ? `1px solid ${BORDER}` : "none" }}>
              <Shimmer width="35%" height={14} radius={4} />
              <Shimmer width="40%" height={14} radius={4} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

