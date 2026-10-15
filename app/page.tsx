import Link from "next/link";
import AgentAwareSection from "@/components/AgentAwareSection";
import PopularBundlesSection from "@/components/PopularBundlesSection";
import SocialProofTicker from "@/components/SocialProofTicker";
import { supabase } from "@/lib/supabase";

const networks = [
  {
    id: "mtn",
    name: "MTN",
    color: "#FFC220",
    gradient: "from-amber-400/20 via-amber-400/5 to-transparent",
    border: "border-amber-400/30",
    badge: "Instant ⚡",
    desc: "Lightning-fast 4G/5G data with 90-day validity",
    startingPrice: "GH₵5.00",
    popularSize: "5GB for GH₵25",
    logoText: "MTN",
  },
  {
    id: "telecel",
    name: "Telecel",
    color: "#EF4444",
    gradient: "from-red-500/20 via-red-500/5 to-transparent",
    border: "border-red-500/30",
    badge: "Non-Expiry 📶",
    desc: "Heavy data packages that never expire",
    startingPrice: "GH₵40.00",
    popularSize: "10GB for GH₵40",
    logoText: "TELECEL",
  },
  {
    id: "airteltigo",
    name: "AirtelTigo",
    color: "#E11D48",
    gradient: "from-rose-500/20 via-rose-500/5 to-transparent",
    border: "border-rose-500/30",
    badge: "Best Value 💰",
    desc: "Most affordable data per gigabyte in Ghana",
    startingPrice: "GH₵4.50",
    popularSize: "4GB for GH₵18",
    logoText: "AT",
  },
];

const features = [
  { icon: "⚡", title: "Automated Instant Delivery", desc: "Our system fulfills verified orders automatically within minutes directly to the recipient." },
  { icon: "📱", title: "Direct MoMo Prompt", desc: "No complex steps. Receive an instant Mobile Money prompt on your handset to approve." },
  { icon: "🔒", title: "Bank-Grade Security", desc: "End-to-end encrypted checkout via Paystack and registered Mobile Money networks." },
  { icon: "💬", title: "24/7 Human WhatsApp Support", desc: "Direct support line with our Accra team whenever you need fast assistance." },
  { icon: "🔄", title: "100% Delivery Guarantee", desc: "Full refund or instant re-dispatch if network telco downtime ever delays your order." },
  { icon: "💼", title: "Earn as an Agent", desc: "Set up your own storefront and earn weekly commissions on every sale in Ghana." },
];

const stats = [
  { value: "45,000+", label: "Customers Served" },
  { value: "180,000+", label: "Orders Fulfilled" },
  { value: "3 Major", label: "Ghana Networks" },
  { value: "99.9%", label: "Delivery Success" },
];

const howItWorks = [
  { step: "01", title: "Select Bundle", desc: "Pick your network and choose from 1GB up to 40GB packages." },
  { step: "02", title: "Enter Recipient", desc: "Input the phone number that will receive the data bundle." },
  { step: "03", title: "Approve MoMo", desc: "Accept the payment prompt directly on your handset." },
  { step: "04", title: "Instant Data", desc: "Bundle arrives on the phone with live SMS & tracking status." },
];

const testimonials = [
  { name: "Kwame M.", location: "Accra", stars: 5, text: "I ordered MTN 5GB for GH₵25 and my data was delivered in under 2 minutes. Best data service in Ghana by far." },
  { name: "Abena A.", location: "Kumasi", stars: 5, text: "The MoMo prompt reflected on my phone instantly. No manual hassle, it just works smoothly every single time." },
  { name: "Kofi A.", location: "Takoradi", stars: 5, text: "I signed up as an agent last month. I've already earned extra income selling bundles to my colleagues and friends." },
  { name: "Efua D.", location: "Tema", stars: 5, text: "Bought both WAEC result checker and MTN data. Got my pin immediately via SMS. Customer support on WhatsApp is top notch." },
];

const faqs = [
  { q: "How fast is data delivery?", a: "Most bundles deliver automatically within 1 to 3 minutes of payment approval. You can follow the live delivery progress on our Track Order page." },
  { q: "Can I buy data for another person?", a: "Yes! Simply enter the recipient's phone number as the data recipient during checkout. The bundle will be delivered directly to their phone." },
  { q: "Which payment methods are accepted?", a: "We accept MTN Mobile Money, Telecel Cash, AirtelTigo Money, and Visa/Mastercard debit cards through Paystack." },
  { q: "What happens if a network error occurs?", a: "If the network has temporary downtime, our system notifies the admin immediately with the recipient's number for priority manual fulfillment or a full refund." },
  { q: "How do I become an agent?", a: "Click 'Become Agent' in the navigation menu, fill in your details, and start selling data bundles with your own custom prices or commission." },
  { q: "How do I track my order?", a: "Every purchase generates a unique reference code (e.g. YBK-XXXXXX). Visit the 'Track Order' page anytime to check real-time status." },
];

type LastDelivery = { placedAt: string; deliveredAt: string; minutes: number; label: string };

async function getLastDelivery(): Promise<LastDelivery | null> {
  try {
    const { data } = await supabase
      .from("orders")
      .select("network, bundle_size, created_at, completed_at")
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.completed_at) return null;

    const minutes = Math.round(
      (new Date(data.completed_at).getTime() - new Date(data.created_at).getTime()) / 60000,
    );
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) return null;

    return {
      placedAt: data.created_at,
      deliveredAt: data.completed_at,
      minutes,
      label: `${(data.network ?? "").toUpperCase()} ${data.bundle_size ?? ""}`.trim(),
    };
  } catch {
    return null;
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDuration(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export default async function Home() {
  const lastDelivery = await getLastDelivery();

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 selection:bg-amber-400 selection:text-slate-950">
      <SocialProofTicker />

      {/* ── HERO SECTION ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        {/* Futuristic glowing ambient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-blue-600/20 via-violet-600/10 to-transparent blur-[120px]" />
          <div className="absolute top-1/3 left-10 w-72 h-72 bg-amber-500/10 blur-[100px]" />
          <div className="absolute top-1/2 right-10 w-80 h-80 bg-rose-500/10 blur-[120px]" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          {/* Live Proof Pill */}
          {lastDelivery && (
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md mb-6 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span className="text-xs font-bold text-emerald-300">
                Latest Delivery: <strong className="text-white">{lastDelivery.label}</strong> completed in {fmtDuration(lastDelivery.minutes)} ({fmtTime(lastDelivery.deliveredAt)})
              </span>
            </div>
          )}

          {/* Subheader pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 text-xs font-bold uppercase tracking-wider mb-6">
            <span>⚡ Ghana&apos;s #1 Automated Data & Voucher Platform</span>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.08] max-w-4xl mx-auto">
            Affordable Internet Data & Vouchers,{" "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Delivered in Seconds.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Buy MTN, Telecel, and AirtelTigo data bundles or BECE & WASSCE result checker vouchers at verified wholesale rates. Instant Mobile Money prompt on your phone.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/buy"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-lg shadow-[0_10px_35px_rgba(251,191,36,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span>Buy Data Now</span>
              <span className="text-xl">⚡</span>
            </Link>

            <Link
              href="/vouchers"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md text-white font-bold text-base hover:bg-white/10 active:scale-[0.98] transition-all"
            >
              <span>Result Checker Vouchers</span>
              <span>🎓</span>
            </Link>

            <Link
              href="/track"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border border-white/10 text-slate-300 text-sm font-semibold hover:text-white hover:bg-white/5 transition-all"
            >
              <span>Track Order</span>
              <span>🔍</span>
            </Link>
          </div>

          {/* Live Network Status Strip */}
          <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm font-semibold text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span>MTN: Instant Delivery ⚡</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span>Telecel: Non-Expiry 📶</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span>AirtelTigo: Best Rates 💰</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_#c084fc]" />
              <span>WAEC Vouchers: Instant SMS 📩</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────── */}
      <section className="border-y border-white/10 bg-[#0a101d]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label} className="p-2">
              <p className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight">{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider font-semibold text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── NETWORK SELECTOR SECTION ────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Choose Your Network</h2>
          <p className="mt-3 text-slate-400 text-sm sm:text-base">
            Select your preferred mobile provider to view all live bundles with matching wholesale pricing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {networks.map((n) => (
            <Link
              key={n.id}
              href={`/buy?network=${n.id}`}
              className={`group relative overflow-hidden rounded-3xl border ${n.border} bg-gradient-to-b ${n.gradient} p-7 text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/50`}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-slate-950 text-base shadow-lg transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: n.color }}
                >
                  {n.logoText}
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold border border-white/10 bg-white/5 text-slate-300">
                  {n.badge}
                </span>
              </div>

              <h3 className="mt-6 text-2xl font-black text-white">{n.name} Data Bundles</h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">{n.desc}</p>

              <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between text-xs">
                <div>
                  <span className="block text-slate-500 uppercase font-semibold">Starting from</span>
                  <span className="text-base font-black text-white">{n.startingPrice}</span>
                </div>
                <div className="text-right">
                  <span className="block text-slate-500 uppercase font-semibold">Top Pick</span>
                  <span className="font-bold text-amber-400">{n.popularSize}</span>
                </div>
              </div>

              <div className="mt-6">
                <span
                  className="inline-flex w-full items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all group-hover:brightness-110"
                  style={{ backgroundColor: n.color, color: "#000" }}
                >
                  <span>Select {n.name} Bundles</span>
                  <span>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── RESULT CHECKER SPOTLIGHT ────────────────────────────────── */}
      <section className="px-4 sm:px-6 pb-20 max-w-6xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-[#0d1326] to-[#070b14] p-8 sm:p-10 shadow-2xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider mb-3">
                🎓 WAEC Examination Portal
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                BECE & WASSCE Result Checker Vouchers
              </h3>
              <p className="mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
                Buy official WAEC result checker PINs and Serial numbers online in Ghana. Delivered instantly via SMS to your phone within 60 seconds.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs sm:text-sm font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">✅ Instant SMS Dispatch</span>
                <span className="flex items-center gap-1.5">✅ Valid for 3 Checks</span>
                <span className="flex items-center gap-1.5">✅ Standard Price: GH₵19 (Bulk: GH₵18)</span>
              </div>
            </div>

            <div className="shrink-0 w-full lg:w-auto flex flex-col sm:flex-row gap-3">
              <Link
                href="/vouchers"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-base shadow-lg shadow-purple-600/30 transition-all text-center"
              >
                <span>Buy Result Checker</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PopularBundlesSection />

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="py-20 border-t border-white/10 bg-[#0a101d]/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">How It Works</h2>
            <p className="mt-3 text-slate-400 text-sm sm:text-base">
              Four simple steps from selection to instant data delivery on your phone.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {howItWorks.map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-white/10 bg-[#0d1629] p-6 text-center transition-all hover:border-amber-400/40"
              >
                <div className="w-12 h-12 mx-auto rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-black text-lg mb-4">
                  {item.step}
                </div>
                <h4 className="text-lg font-bold text-white">{item.title}</h4>
                <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Why Choose Elite Data?</h2>
          <p className="mt-3 text-slate-400 text-sm sm:text-base">
            Engineered for high-volume transactions, reliability, and security.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-[#0a1120] p-6 hover:border-white/20 transition-all"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h4 className="text-base font-bold text-white">{f.title}</h4>
              <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────── */}
      <section className="py-20 border-t border-white/10 bg-[#080d19]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Real Customer Feedback</h2>
            <p className="mt-3 text-slate-400 text-sm sm:text-base">
              Trusted by students, professionals, and resellers across Ghana.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/10 bg-[#0d1629] p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex gap-1 text-amber-400 text-sm mb-3">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <span key={i}>★</span>
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 italic leading-relaxed">
                    &ldquo;{t.text}&rdquo;
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-600 flex items-center justify-center font-bold text-slate-950 text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{t.name}</p>
                    <p className="text-[11px] text-slate-500">{t.location}, Ghana</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENT BANNER ────────────────────────────────────────────── */}
      <AgentAwareSection>
        <section className="py-16 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-r from-amber-950/30 via-[#131d33] to-[#0a1120] p-8 sm:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 shadow-2xl">
            <div className="max-w-2xl">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 block mb-2">
                Agent Program · Earn Daily
              </span>
              <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Become a Data Agent in Ghana
              </h3>
              <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
                Join over 500+ agents who earn daily profits selling data bundles and vouchers to friends, students, and businesses. Set your own prices or earn direct commissions.
              </p>
            </div>
            <Link
              href="/agent"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-base shadow-xl shadow-amber-400/20 transition-all text-center whitespace-nowrap"
            >
              <span>Apply as Agent</span>
              <span>→</span>
            </Link>
          </div>
        </section>
      </AgentAwareSection>

      {/* ── FAQS ────────────────────────────────────────────────────── */}
      <section className="py-20 border-t border-white/10 bg-[#070b14]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Frequently Asked Questions</h2>
            <p className="mt-2 text-slate-400 text-sm">Everything you need to know about buying data with Elite Data.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-white/10 bg-[#0c1322] p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-bold text-white text-base">
                  <span>{f.q}</span>
                  <span className="text-xl text-amber-400 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed pt-3 border-t border-white/10">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CALL TO ACTION ────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 text-center border-t border-white/10 bg-gradient-to-b from-[#060a12] via-[#091122] to-[#060a12]">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Ready to Get Your Data?
          </h2>
          <p className="mt-4 text-slate-400 text-sm sm:text-base leading-relaxed">
            Join thousands of satisfied Ghanaians who get fast, dependable internet data every single day.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/buy"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-lg shadow-xl shadow-amber-400/25 hover:scale-[1.02] transition-all"
            >
              Order Data Bundle ⚡
            </Link>
            <a
              href="https://wa.me/233509794503"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-7 py-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-bold text-base hover:bg-emerald-500/20 transition-all"
            >
              Chat on WhatsApp 💬
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
