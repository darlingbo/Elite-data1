"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type PromoBanner = {
  enabled: boolean;
  message: string;
  submessage: string;
  theme: "blue" | "gold" | "purple" | "green";
};

const themes = {
  blue:   { bg: "linear-gradient(135deg,#060d2e,#0f2562,#2563eb)", accent: "#60a5fa", star: "#bfdbfe", head: "#3b82f6", body: "#1d4ed8" },
  gold:   { bg: "linear-gradient(135deg,#1c0a00,#78350f,#d97706)", accent: "#fbbf24", star: "#fef08a", head: "#f59e0b", body: "#b45309" },
  purple: { bg: "linear-gradient(135deg,#0d0526,#3b0764,#7c3aed)", accent: "#c4b5fd", star: "#ede9fe", head: "#8b5cf6", body: "#6d28d9" },
  green:  { bg: "linear-gradient(135deg,#011a0a,#14532d,#16a34a)", accent: "#4ade80", star: "#bbf7d0", head: "#22c55e", body: "#15803d" },
};

const bundleColors = [
  { bg: "#fbbf24", text: "#78350f", name: "MTN", size: "5GB" },
  { bg: "#ef4444", text: "#fff",    name: "AT",  size: "3GB" },
  { bg: "#3b82f6", text: "#fff",    name: "TEL", size: "2GB" },
];

export default function MascotBanner() {
  const [banner, setBanner] = useState<PromoBanner | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("promo-dismissed")) return;
    fetch("/api/promo-banner")
      .then(r => r.json())
      .then(d => { if (d.enabled && d.message) { setBanner(d); setVisible(true); } })
      .catch(() => {});
  }, []);

  if (!visible || !banner) return null;

  const t = themes[banner.theme] ?? themes.blue;

  return (
    <>
      <style>{`
        @keyframes mascot-jump {
          0%,42%,100%{transform:translateY(0) scaleY(1)}
          50%{transform:translateY(-54px) scaleY(1.05)}
          55%{transform:translateY(-60px) scaleY(1)}
          95%{transform:translateY(0) scaleY(0.88)}
          97%{transform:translateY(-4px) scaleY(1.08)}
        }
        @keyframes bundle-roll {
          0%{left:105%}100%{left:-14%}
        }
        @keyframes bundle-roll-b {
          0%{left:105%}100%{left:-14%}
        }
        @keyframes blink{
          0%,89%,100%{transform:scaleY(1)}
          94%{transform:scaleY(0.05)}
        }
        @keyframes antenna-sway {
          0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg)}
        }
        @keyframes ground-run {
          0%{background-position:0 0}100%{background-position:-32px 0}
        }
        @keyframes sparkle-pop {
          0%{opacity:0;transform:translateY(0) scale(0) rotate(0deg)}
          40%{opacity:1;transform:translateY(-22px) scale(1) rotate(120deg)}
          100%{opacity:0;transform:translateY(-50px) scale(0.4) rotate(360deg)}
        }
        @keyframes star-pulse {
          0%,100%{opacity:.15;transform:scale(.7)}
          50%{opacity:1;transform:scale(1.3)}
        }
        @keyframes text-float {
          0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}
        }
        @keyframes shadow-squish {
          0%,42%,100%{transform:scaleX(1);opacity:.4}
          50%{transform:scaleX(.3);opacity:.1}
        }
        .em-mascot{animation:mascot-jump 2.2s cubic-bezier(.36,.07,.19,.97) infinite}
        .em-bundle-a{animation:bundle-roll 2.2s linear infinite}
        .em-bundle-b{animation:bundle-roll-b 2.2s linear infinite;animation-delay:1.1s}
        .em-eye{animation:blink 3.5s ease-in-out infinite}
        .em-eye-r{animation:blink 3.5s ease-in-out infinite;animation-delay:.15s}
        .em-antenna{animation:antenna-sway .55s ease-in-out infinite;transform-origin:bottom center}
        .em-ground{animation:ground-run .45s linear infinite}
        .em-text{animation:text-float 2.4s ease-in-out infinite}
        .em-shadow{animation:shadow-squish 2.2s cubic-bezier(.36,.07,.19,.97) infinite}
      `}</style>

      <div style={{ background: t.bg, position: "relative", overflow: "hidden", borderBottom: `2px solid ${t.accent}30` }}>
        {/* Glowing orbs behind */}
        <div style={{ position:"absolute",top:"-30%",left:"10%",width:200,height:200,borderRadius:"50%",background:`${t.accent}18`,filter:"blur(40px)",pointerEvents:"none" }}/>
        <div style={{ position:"absolute",bottom:"-20%",right:"15%",width:160,height:160,borderRadius:"50%",background:`${t.accent}12`,filter:"blur(36px)",pointerEvents:"none" }}/>

        {/* Stars */}
        {[...Array(22)].map((_,i) => (
          <div key={i} style={{
            position:"absolute",
            left:`${(i*4.7+2)%100}%`,
            top:`${(i*13+5)%90}%`,
            width:i%4===0?5:i%3===0?4:3,
            height:i%4===0?5:i%3===0?4:3,
            borderRadius:"50%",
            background:t.star,
            animation:`star-pulse ${1.1+(i%5)*0.35}s ease-in-out infinite`,
            animationDelay:`${(i*0.23)%2.5}s`,
            pointerEvents:"none",
          }}/>
        ))}

        <div style={{ maxWidth:940,margin:"0 auto",padding:"18px 16px",display:"flex",alignItems:"center",gap:20,position:"relative" }}>

          {/* ── Scene ── */}
          <div style={{ position:"relative",width:190,height:96,flexShrink:0 }}>

            {/* Ground */}
            <div className="em-ground" style={{
              position:"absolute",bottom:0,left:0,right:0,height:3,borderRadius:2,
              background:`repeating-linear-gradient(90deg,${t.accent} 0,${t.accent} 14px,transparent 14px,transparent 22px)`,
            }}/>

            {/* Shadow under mascot */}
            <div className="em-shadow" style={{
              position:"absolute",bottom:2,left:14,width:32,height:5,
              borderRadius:"50%",background:t.accent,
            }}/>

            {/* Bundle A */}
            <div className="em-bundle-a" style={{
              position:"absolute",bottom:3,width:46,height:40,borderRadius:10,
              background:bundleColors[0].bg,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              boxShadow:`0 0 14px ${bundleColors[0].bg}88`,
              fontSize:10,fontWeight:900,color:bundleColors[0].text,lineHeight:1.3,
              border:`2px solid ${bundleColors[0].bg}cc`,
            }}>
              <span style={{fontSize:14}}>📶</span>
              <span>{bundleColors[0].name}</span>
              <span>{bundleColors[0].size}</span>
            </div>

            {/* Bundle B */}
            <div className="em-bundle-b" style={{
              position:"absolute",bottom:3,width:46,height:40,borderRadius:10,
              background:bundleColors[1].bg,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              boxShadow:`0 0 14px ${bundleColors[1].bg}88`,
              fontSize:10,fontWeight:900,color:bundleColors[1].text,lineHeight:1.3,
              border:`2px solid ${bundleColors[1].bg}cc`,
            }}>
              <span style={{fontSize:14}}>📡</span>
              <span>{bundleColors[1].name}</span>
              <span>{bundleColors[1].size}</span>
            </div>

            {/* Mascot */}
            <div className="em-mascot" style={{ position:"absolute",bottom:3,left:12 }}>
              {/* Antenna */}
              <div style={{ position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)" }}>
                <div className="em-antenna" style={{ width:3,height:16,background:t.accent,borderRadius:2,margin:"0 auto" }}/>
                <div style={{ width:10,height:10,borderRadius:"50%",background:t.accent,boxShadow:`0 0 8px ${t.accent}`,marginTop:-2,marginLeft:-3.5 }}/>
              </div>

              {/* Head */}
              <div style={{
                width:38,height:38,borderRadius:"50%",
                background:`radial-gradient(circle at 35% 35%,${t.head},${t.body})`,
                position:"relative",boxShadow:`0 0 18px ${t.accent}55,inset 0 -4px 8px rgba(0,0,0,.2)`,
              }}>
                {/* Eyes */}
                <div style={{ position:"absolute",top:11,left:0,right:0,display:"flex",justifyContent:"center",gap:8 }}>
                  {[0,1].map(i => (
                    <div key={i} style={{ width:9,height:10,borderRadius:"50%",background:"white",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"inset 0 1px 2px rgba(0,0,0,.2)" }}>
                      <div className={i===0?"em-eye":"em-eye-r"} style={{ width:5,height:5,borderRadius:"50%",background:"#1e3a8a" }}/>
                    </div>
                  ))}
                </div>
                {/* Smile */}
                <div style={{ position:"absolute",bottom:8,left:"50%",transform:"translateX(-50%)",width:16,height:7,borderBottomLeftRadius:10,borderBottomRightRadius:10,background:"white" }}/>
              </div>

              {/* Body */}
              <div style={{
                width:30,height:22,borderRadius:7,margin:"3px auto 0",
                background:`linear-gradient(180deg,${t.head},${t.body})`,
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:`0 3px 8px rgba(0,0,0,.3)`,
              }}>
                <span style={{ fontSize:13 }}>📶</span>
              </div>

              {/* Legs */}
              <div style={{ display:"flex",gap:6,justifyContent:"center",marginTop:3 }}>
                {[0,1].map(i => (
                  <div key={i} style={{
                    width:9,height:15,borderRadius:5,
                    background:`linear-gradient(180deg,${t.body},${t.body}aa)`,
                    boxShadow:`0 2px 4px rgba(0,0,0,.3)`,
                  }}/>
                ))}
              </div>
            </div>

            {/* Floating sparkles */}
            {["⭐","✨","💫"].map((em,i) => (
              <div key={i} style={{
                position:"absolute",
                left:`${30+i*22}%`,top:`${5+i*12}%`,
                fontSize:13,
                animation:`sparkle-pop ${1.4+i*0.35}s ease-out infinite`,
                animationDelay:`${i*0.48}s`,
                pointerEvents:"none",
              }}>{em}</div>
            ))}
          </div>

          {/* ── Text ── */}
          <div className="em-text" style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:10,fontWeight:800,letterSpacing:3,color:t.accent,textTransform:"uppercase",marginBottom:5 }}>
              🎉 Monthly Special
            </div>
            <div style={{
              fontSize:21,fontWeight:900,color:"#fff",lineHeight:1.2,marginBottom:5,
              textShadow:`0 0 24px ${t.accent}66`,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
            }}>
              {banner.message}
            </div>
            {banner.submessage && (
              <div style={{ fontSize:13,color:t.star,fontWeight:600,opacity:.9 }}>{banner.submessage}</div>
            )}
          </div>

          {/* ── CTA ── */}
          <Link href="/buy" style={{
            flexShrink:0,background:t.accent,color:"#000",fontWeight:900,fontSize:14,
            padding:"11px 22px",borderRadius:14,textDecoration:"none",
            boxShadow:`0 4px 18px ${t.accent}55`,display:"block",
          }}>
            Buy Now →
          </Link>
        </div>

        {/* Close btn */}
        <button
          onClick={() => { setVisible(false); try { sessionStorage.setItem("promo-dismissed","1"); } catch { /**/ } }}
          aria-label="Close"
          style={{
            position:"absolute",top:8,right:8,background:"rgba(255,255,255,.12)",
            border:"none",color:"#fff",width:26,height:26,borderRadius:"50%",
            cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",
          }}
        >×</button>
      </div>
    </>
  );
}
