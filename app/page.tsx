import Link from "next/link";
import AgentAwareSection from "@/components/AgentAwareSection";
import PopularBundlesSection from "@/components/PopularBundlesSection";
import SocialProofTicker from "@/components/SocialProofTicker";
import MascotBanner from "@/components/MascotBanner";

const BG     = "#080f1e";
const CARD   = "#0d1b2e";
const BORDER = "#1e3a5f";
const TEXT   = "#f8fafc";
const MUTED  = "#94a3b8";
const SUB    = "#64748b";
const YELLOW = "#fbbf24";

const networks = [
  { name: "MTN",         color: "#FFC220", glow: "rgba(255,194,32,0.18)", desc: "Fast, reliable data from GH₵4",     logo: "MTN" },
  { name: "Telecel",     color: "#E8001D", glow: "rgba(232,0,29,0.18)",   desc: "Affordable bundles from GH₵3.50",  logo: "T"   },
  { name: "AirtelTigo",  color: "#E4002B", glow: "rgba(228,0,43,0.18)",   desc: "Budget-friendly from GH₵3",        logo: "AT"  },
];

const features = [
  { icon: "✅", title: "Verified Delivery",  desc: "Every paid order is reviewed before it is sent for delivery." },
  { icon: "🔒", title: "Secure Payment",     desc: "Pay safely with mobile money or card via Paystack." },
  { icon: "💰", title: "Best Prices",        desc: "Lowest data bundle prices across all networks in Ghana." },
  { icon: "📞", title: "24/7 Support",       desc: "Live support on WhatsApp anytime you need help." },
  { icon: "🤖", title: "Fully Automated",    desc: "No manual processing — orders fulfill themselves instantly." },
  { icon: "🔗", title: "Agent Earnings",     desc: "Become an agent and earn on every sale you refer." },
];

const stats = [
  { value: "30,000+",  label: "Happy Customers" },
  { value: "100,000+", label: "Orders Delivered" },
  { value: "3",        label: "Networks" },
  { value: "99.9%",   label: "Uptime" },
];

const howItWorks = [
  { step: "1", title: "Choose Bundle", desc: "Pick your network and the data size you need." },
  { step: "2", title: "Enter Number",  desc: "Type the phone number that will receive the data." },
  { step: "3", title: "Pay Securely",  desc: "Pay via mobile money or card through Paystack." },
  { step: "4", title: "Get Data",      desc: "After approval, your bundle is sent and can be tracked online." },
];

const testimonials = [
  { name: "Kwame M.",  location: "Accra",    stars: 5, text: "Ordered MTN 5GB and it came in 2 minutes. Cheapest prices I've seen in Ghana!" },
  { name: "Abena A.",  location: "Kumasi",   stars: 5, text: "After my first order I became a regular. The automatic delivery is amazing." },
  { name: "Kofi A.",   location: "Takoradi", stars: 5, text: "Even became an agent. Earning extra income weekly just by sharing my link." },
  { name: "Efua D.",   location: "Tema",     stars: 5, text: "Customer support on WhatsApp is top notch. Very trustworthy platform." },
];

const faqs = [
  { q: "How fast is delivery?",               a: "Paid orders enter an approval queue. Once approved, delivery normally begins within minutes, and you can track progress online." },
  { q: "Which payment methods are accepted?", a: "All major mobile money (MTN MoMo, Telecel Cash, AirtelTigo Money) and bank cards via Paystack — Ghana's most trusted payment gateway." },
  { q: "What if my bundle doesn't arrive?",   a: "Contact us immediately on WhatsApp (+233 509 794 503). We resolve all delivery issues within 30 minutes." },
  { q: "Can I buy for someone else's number?",a: "Yes! Just enter the recipient's phone number in the checkout form. The bundle goes directly to that number." },
  { q: "How do I become an agent?",           a: "Click 'Become Agent' in the navigation, fill the short form, and we'll review your application within 24 hours." },
  { q: "How do I track my order?",            a: "After payment, you receive a reference code. Use it on the Track Order page to check your delivery status anytime." },
];

export default function Home() {
  return (
    <div style={{ background: BG }}>
      <MascotBanner />
      <SocialProofTicker />

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section style={{
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.13) 0%, transparent 65%),
                     radial-gradient(ellipse 40% 30% at 85% 85%, rgba(251,191,36,0.05) 0%, transparent 60%),
                     ${BG}`,
        padding: "72px 16px 64px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Dot grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />

        <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>
          <span style={{
            display: "inline-block",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.28)",
            color: YELLOW,
            fontSize: 11, fontWeight: 800,
            padding: "5px 14px", borderRadius: 999,
            marginBottom: 22,
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            Ghana&apos;s #1 Data Bundle Store
          </span>

          <h1 style={{
            fontSize: "clamp(2.2rem, 6vw, 3.8rem)",
            fontWeight: 900, color: TEXT, lineHeight: 1.1,
            margin: "0 0 18px",
          }}>
            Buy Affordable Data Bundles<br />
            <span style={{ color: YELLOW }}>Online in Ghana</span>
          </h1>

          <p style={{
            color: MUTED,
            fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)",
            margin: "0 auto 36px",
            maxWidth: 460, lineHeight: 1.65,
          }}>
            Buy MTN, Telecel and AirtelTigo data bundles with secure payment and online order tracking. No account needed.
          </p>

          <div className="flex flex-col items-center gap-3 mb-10">
            <Link href="/buy"
              className="w-full sm:w-auto"
              style={{
                display: "inline-block",
                background: YELLOW, color: "#111",
                fontWeight: 900, fontSize: 17,
                padding: "16px 44px", borderRadius: 14,
                textDecoration: "none",
                boxShadow: "0 6px 28px rgba(251,191,36,0.28)",
                textAlign: "center",
              }}>
              Buy Data Now ⚡
            </Link>
            <Link href="/vouchers"
              className="w-full sm:w-auto"
              style={{
                display: "inline-block",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: TEXT,
                fontWeight: 700, fontSize: 15,
                padding: "14px 36px", borderRadius: 14,
                textDecoration: "none",
                textAlign: "center",
              }}>
              📋 Result Checker Vouchers
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {["✅ Paystack Secured", "🛡️ Admin-Verified", "💬 WhatsApp Support", "🔄 100% Refund if Failed"].map(b => (
              <span key={b} style={{ color: MUTED, fontSize: 13 }}>{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────── */}
      <section style={{ background: CARD, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-2 md:grid-cols-4 max-w-3xl mx-auto">
          {stats.map((s, i) => (
            <div key={s.label} style={{
              textAlign: "center", padding: "28px 12px",
              borderRight: i % 2 === 0 ? `1px solid ${BORDER}` : "none",
              borderBottom: i < 2 ? `1px solid ${BORDER}` : "none",
            }}
              className="md:[border-right:1px_solid_#1e3a5f] md:[border-bottom:none] last:border-r-0">
              <p style={{ fontSize: 30, fontWeight: 900, color: YELLOW, margin: "0 0 4px" }}>{s.value}</p>
              <p style={{ fontSize: 12, color: MUTED, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── NETWORKS ──────────────────────────────────────────────── */}
      <section style={{ padding: "72px 16px", background: BG }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <h2 style={{ fontSize: "clamp(1.6rem,4vw,2.3rem)", fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>Choose Your Network</h2>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>We support all major telecom networks in Ghana</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {networks.map(n => (
              <Link key={n.name} href="/buy"
                className="group flex flex-col items-center text-center rounded-2xl transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  padding: "36px 28px",
                  textDecoration: "none",
                }}>
                <div style={{
                  width: 76, height: 76, borderRadius: "50%",
                  background: n.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#111", fontWeight: 900, fontSize: 16,
                  marginBottom: 18,
                  boxShadow: `0 8px 24px ${n.glow}`,
                  transition: "transform 0.2s, box-shadow 0.2s",
                }} className="group-hover:scale-110">
                  {n.logo}
                </div>
                <h3 style={{ color: TEXT, fontWeight: 900, fontSize: 19, margin: "0 0 8px" }}>{n.name}</h3>
                <p style={{ color: MUTED, fontSize: 13, margin: "0 0 22px", lineHeight: 1.55 }}>{n.desc}</p>
                <span style={{
                  color: n.color,
                  border: `1px solid ${n.color}`,
                  borderRadius: 10, padding: "9px 22px",
                  fontSize: 13, fontWeight: 700,
                  display: "inline-block",
                }}>
                  Buy Now →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── VOUCHER BANNER ────────────────────────────────────────── */}
      <section style={{ padding: "0 16px 64px", background: BG }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 20, padding: "28px 32px",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap", gap: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
              }}>📋</div>
              <div>
                <p style={{ color: "#a78bfa", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>Ghana Education Service</p>
                <h2 style={{ color: TEXT, fontWeight: 900, fontSize: 18, margin: "0 0 4px" }}>BECE &amp; WASSCE Result Checker Vouchers</h2>
                <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Instant PIN delivery via SMS · GH₵18 each</p>
              </div>
            </div>
            <Link href="/vouchers" style={{
              background: "rgba(139,92,246,0.12)",
              border: "1px solid rgba(139,92,246,0.35)",
              color: "#a78bfa",
              fontWeight: 700, fontSize: 14,
              padding: "12px 24px", borderRadius: 12,
              textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
            }}>
              Buy Voucher →
            </Link>
          </div>
        </div>
      </section>

      <PopularBundlesSection />

      {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
      <section style={{ padding: "72px 16px", background: CARD, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <h2 style={{ fontSize: "clamp(1.6rem,4vw,2.3rem)", fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>How It Works</h2>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>Buying data is fast, simple, and checked before delivery</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {howItWorks.map((h, i) => (
              <div key={h.step} style={{ textAlign: "center", position: "relative" }}>
                <div style={{
                  width: 60, height: 60,
                  background: "rgba(59,130,246,0.1)",
                  border: "2px solid rgba(59,130,246,0.25)",
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 900, color: "#60a5fa",
                  margin: "0 auto 18px",
                }}>
                  {h.step}
                </div>
                {i < howItWorks.length - 1 && (
                  <div className="hidden md:block" style={{
                    position: "absolute", top: 29, left: "calc(50% + 30px)", right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, rgba(59,130,246,0.25), transparent)`,
                  }} />
                )}
                <h3 style={{ color: TEXT, fontWeight: 800, fontSize: 16, margin: "0 0 8px" }}>{h.title}</h3>
                <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.65, margin: 0 }}>{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────── */}
      <section style={{ padding: "72px 16px", background: BG }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(1.6rem,4vw,2.3rem)", fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>Why Choose Elite Data?</h2>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>Built for speed, trust, and savings</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {features.map(f => (
              <div key={f.title} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
                padding: "24px", display: "flex", gap: 16, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>{f.icon}</span>
                <div>
                  <h3 style={{ color: TEXT, fontWeight: 800, fontSize: 15, margin: "0 0 6px" }}>{f.title}</h3>
                  <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.65 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────── */}
      <section style={{ padding: "72px 16px", background: CARD, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(1.6rem,4vw,2.3rem)", fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>What Customers Say</h2>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>Trusted by thousands of Ghanaians every day</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {testimonials.map(t => (
              <div key={t.name} style={{
                background: BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px",
              }}>
                <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <span key={i} style={{ color: YELLOW, fontSize: 13 }}>★</span>
                  ))}
                </div>
                <p style={{ color: MUTED, fontSize: 13, margin: "0 0 16px", lineHeight: 1.65, fontStyle: "italic" }}>&ldquo;{t.text}&rdquo;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(59,130,246,0.12)",
                    border: "1px solid rgba(59,130,246,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#60a5fa", fontWeight: 900, fontSize: 14,
                  }}>
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p style={{ color: TEXT, fontWeight: 700, fontSize: 13, margin: "0 0 1px" }}>{t.name}</p>
                    <p style={{ color: SUB, fontSize: 11, margin: 0 }}>{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENT BANNER ──────────────────────────────────────────── */}
      <AgentAwareSection>
        <section style={{ padding: "60px 16px", background: BG, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 920, margin: "0 auto" }}>
            <div style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 20, padding: "36px 32px",
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap", gap: 24,
            }}>
              <div>
                <p style={{ color: YELLOW, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Agent Program</p>
                <h2 style={{ color: TEXT, fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>Earn Money as an Elite Data Agent</h2>
                <p style={{ color: MUTED, fontSize: 14, margin: 0, maxWidth: 420, lineHeight: 1.6 }}>
                  Share your referral link — earn on every bundle sold through it. Free to join.
                </p>
              </div>
              <Link href="/agent" style={{
                background: YELLOW, color: "#111",
                fontWeight: 900, fontSize: 15,
                padding: "14px 32px", borderRadius: 14,
                textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                boxShadow: "0 6px 24px rgba(251,191,36,0.22)",
              }}>
                Become an Agent →
              </Link>
            </div>
          </div>
        </section>
      </AgentAwareSection>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section style={{ padding: "72px 16px", background: CARD, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: "clamp(1.6rem,4vw,2.3rem)", fontWeight: 900, color: TEXT, margin: "0 0 10px" }}>Frequently Asked Questions</h2>
            <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>Everything you need to know</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {faqs.map(f => (
              <details key={f.q} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 14 }}>
                <summary style={{
                  padding: "18px 20px", fontWeight: 700, cursor: "pointer",
                  color: TEXT, display: "flex", alignItems: "center",
                  justifyContent: "space-between", listStyle: "none",
                  fontSize: 15,
                }}>
                  {f.q}
                  <span style={{ color: "#60a5fa", fontSize: 20, flexShrink: 0, marginLeft: 12 }}>+</span>
                </summary>
                <p style={{
                  padding: "14px 20px 20px", margin: 0,
                  color: MUTED, fontSize: 14, lineHeight: 1.7,
                  borderTop: `1px solid ${BORDER}`,
                }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section style={{
        padding: "80px 16px", textAlign: "center",
        background: `radial-gradient(ellipse 50% 70% at 50% 50%, rgba(251,191,36,0.05) 0%, transparent 70%), ${BG}`,
        borderTop: `1px solid ${BORDER}`,
      }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.6rem)", fontWeight: 900, color: TEXT, margin: "0 0 14px" }}>Ready to Buy Data?</h2>
          <p style={{ color: MUTED, fontSize: 15, margin: "0 0 32px", lineHeight: 1.65 }}>
            Join 30,000+ Ghanaians who trust Elite Data for their daily internet needs.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/buy" style={{
              background: YELLOW, color: "#111",
              fontWeight: 900, fontSize: 16,
              padding: "16px 38px", borderRadius: 14,
              textDecoration: "none",
              boxShadow: "0 8px 28px rgba(251,191,36,0.28)",
            }}>
              Buy Data Now ⚡
            </Link>
            <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer" style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.28)",
              color: "#4ade80",
              fontWeight: 700, fontSize: 15,
              padding: "15px 28px", borderRadius: 14,
              textDecoration: "none",
            }}>
              WhatsApp Support
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
