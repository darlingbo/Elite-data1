const BG   = "#080f1e";
const CARD = "#0d1b2e";
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

export default function BuyLoading() {
  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "32px 16px" }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Header shimmer */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <Shimmer width="60%" height={32} radius={10} />
          <div style={{ marginTop: 12 }}><Shimmer width="40%" height={16} radius={6} /></div>
        </div>

        {/* Network tabs */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
              <Shimmer width={36} height={36} radius={10} />
              <div style={{ marginTop: 8 }}><Shimmer width="70%" height={14} /></div>
            </div>
          ))}
        </div>

        {/* Bundle cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16 }}>
              <Shimmer width="50%" height={22} radius={6} />
              <div style={{ marginTop: 10 }}><Shimmer width="80%" height={14} radius={4} /></div>
              <div style={{ marginTop: 8 }}><Shimmer width="60%" height={14} radius={4} /></div>
              <div style={{ marginTop: 16 }}><Shimmer height={38} radius={10} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

