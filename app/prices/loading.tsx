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

export default function PricesLoading() {
  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "40px 16px" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <Shimmer width="55%" height={34} radius={10} />
          <div style={{ marginTop: 12 }}><Shimmer width="45%" height={16} radius={6} /></div>
        </div>

        {/* Tab selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, justifyContent: "center" }}>
          {[1, 2, 3].map((i) => <div key={i} style={{ width: 100 }}><Shimmer height={38} radius={10} /></div>)}
        </div>

        {/* Price table rows */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, overflow: "hidden" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: i < 10 ? `1px solid ${BORDER}` : "none" }}>
              <Shimmer width={60} height={16} radius={4} />
              <Shimmer width="30%" height={16} radius={4} />
              <Shimmer width={60} height={16} radius={4} />
              <div style={{ marginLeft: "auto", width: 90 }}><Shimmer height={34} radius={8} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

