import Link from "next/link";
import AgentAwareSection from "@/components/AgentAwareSection";

const networks = [
  { name: "MTN", border: "border-yellow-300", desc: "MTN data bundles from GH₵4", logo: "MTN", logoColor: "bg-yellow-400", textColor: "text-yellow-700", btnColor: "bg-yellow-400" },
  { name: "Telecel", border: "border-red-200", desc: "Telecel data bundles from GH₵3.50", logo: "T", logoColor: "bg-red-500", textColor: "text-red-600", btnColor: "bg-red-500" },
  { name: "AirtelTigo", border: "border-rose-200", desc: "AirtelTigo bundles from GH₵3", logo: "AT", logoColor: "bg-rose-600", textColor: "text-rose-600", btnColor: "bg-rose-600" },
];

const features = [
  { icon: "⚡", title: "Instant Delivery", desc: "Bundle arrives within minutes after payment — automatically." },
  { icon: "🔒", title: "Secure Payment", desc: "Pay safely with mobile money or card via Paystack." },
  { icon: "💰", title: "Best Prices", desc: "Lowest data bundle prices across all networks in Ghana." },
  { icon: "📞", title: "24/7 Support", desc: "Live support on WhatsApp anytime you need help." },
  { icon: "🤖", title: "Fully Automated", desc: "No manual processing — orders fulfill themselves instantly." },
  { icon: "🔗", title: "Agent Earnings", desc: "Become an agent and earn 80% profit on every sale you refer." },
];

const stats = [
  { value: "30,000+", label: "Happy Customers" },
  { value: "100,000+", label: "Orders Delivered" },
  { value: "3", label: "Networks Supported" },
  { value: "99.9%", label: "Uptime" },
];

const howItWorks = [
  { step: "1", title: "Choose Your Bundle", desc: "Pick your network and select the data size you want." },
  { step: "2", title: "Enter Your Number", desc: "Provide the phone number that will receive the data." },
  { step: "3", title: "Pay Securely", desc: "Complete payment via mobile money or card through Paystack." },
  { step: "4", title: "Receive Your Data", desc: "Your bundle is delivered automatically within minutes." },
];

const testimonials = [
  { name: "Kwame Mensah", location: "Accra", stars: 5, text: "Ordered MTN 5GB and it came in under 2 minutes. Cheapest prices I've seen anywhere in Ghana. Will definitely be back!" },
  { name: "Abena Asante", location: "Kumasi", stars: 5, text: "I was skeptical at first but after my first order I became a regular customer. The automatic delivery is amazing. No waiting!" },
  { name: "Kofi Agyeman", location: "Takoradi", stars: 5, text: "Even became an agent now. Earning extra income every week just by sharing my link. Elite Data is the real deal." },
  { name: "Efua Darko", location: "Tema", stars: 5, text: "Customer support on WhatsApp is top notch. Had a small issue and it was resolved within minutes. Very trustworthy." },
];

const faqs = [
  { q: "How fast is delivery?", a: "Bundles are delivered automatically within 1–5 minutes after payment is confirmed. No manual steps needed." },
  { q: "Which payment methods are accepted?", a: "We accept all major mobile money (MTN MoMo, Telecel Cash, AirtelTigo Money) and bank cards via Paystack — Ghana's most trusted payment gateway." },
  { q: "What if my bundle doesn't arrive?", a: "Contact us immediately on WhatsApp (+233 556 631 260). We resolve all delivery issues within 30 minutes." },
  { q: "Can I buy for someone else's number?", a: "Yes! Just enter the recipient's phone number in the checkout form. The bundle goes directly to that number." },
  { q: "How do I become an agent?", a: "Click 'Become Agent' in the navigation, fill the short form, and we'll review your application within 24 hours. You earn 80% of every sale made through your referral link." },
  { q: "How do I track my order?", a: "After payment, you receive a reference code. Use it on the Track Order page to check your delivery status anytime." },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 text-white py-20 px-4 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-yellow-400 blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <span className="inline-block bg-white/20 backdrop-blur text-white text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider border border-white/30">
            Ghana&apos;s #1 Data Bundle Store
          </span>
          <h1 className="text-4xl md:text-6xl font-black leading-tight mb-4">
            Buy Cheap Data Bundles<br />
            <span className="text-yellow-300">Instantly in Ghana</span>
          </h1>
          <p className="text-blue-100 text-lg md:text-xl mb-8 max-w-xl mx-auto">
            MTN, Telecel &amp; AirtelTigo bundles at the lowest prices. Delivered in minutes. No account needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Link href="/buy" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-4 rounded-xl text-lg transition-all shadow-lg hover:shadow-yellow-400/30 hover:-translate-y-0.5">
              Buy Data Now ⚡
            </Link>
            <Link href="/track" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-4 rounded-xl transition-colors border border-white/30 backdrop-blur">
              Track My Order
            </Link>
          </div>
          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-4 text-sm text-blue-200">
            <span className="flex items-center gap-1">✅ Paystack Secured</span>
            <span className="flex items-center gap-1">⚡ Auto-Delivery</span>
            <span className="flex items-center gap-1">💬 WhatsApp Support</span>
            <span className="flex items-center gap-1">🔄 100% Refund if Failed</span>
          </div>
        </div>
      </section>

      {/* Live stats bar */}
      <section className="bg-blue-900 py-8 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-black text-yellow-400">{s.value}</p>
              <p className="text-blue-200 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Networks */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-gray-800 mb-2">Choose Your Network</h2>
            <p className="text-gray-500">We support all major telecom networks in Ghana</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {networks.map((n) => (
              <Link href="/buy" key={n.name}
                className={`bg-white rounded-2xl border-2 ${n.border} p-6 flex flex-col items-center gap-4 hover:shadow-xl transition-all hover:-translate-y-1 text-center group`}>
                <div className={`w-20 h-20 rounded-full ${n.logoColor} flex items-center justify-center text-white font-black text-xl shadow-lg group-hover:scale-110 transition-transform`}>
                  {n.logo}
                </div>
                <div>
                  <h3 className={`text-xl font-black ${n.textColor}`}>{n.name}</h3>
                  <p className="text-gray-500 text-sm mt-1">{n.desc}</p>
                </div>
                <span className={`${n.btnColor} text-white text-sm font-semibold px-5 py-2 rounded-lg shadow`}>
                  Buy Now →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-gray-800 mb-2">How It Works</h2>
            <p className="text-gray-500">Buying data is fast, simple, and fully automatic</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 relative">
            {howItWorks.map((h, i) => (
              <div key={h.step} className="text-center p-5 relative">
                <div className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-xl mx-auto mb-4 shadow-lg shadow-blue-200">
                  {h.step}
                </div>
                {i < howItWorks.length - 1 && (
                  <div className="hidden md:block absolute top-7 left-[calc(50%+28px)] right-0 h-0.5 bg-blue-100" />
                )}
                <h3 className="font-bold text-gray-800 mb-2">{h.title}</h3>
                <p className="text-gray-500 text-sm">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-gray-800 mb-2">Why Choose Elite Data?</h2>
            <p className="text-gray-500">Built for speed, trust, and savings</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex gap-4">
                <div className="text-3xl shrink-0">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-gray-800 mb-1">{f.title}</h3>
                  <p className="text-gray-500 text-sm">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-gray-800 mb-2">What Customers Say</h2>
            <p className="text-gray-500">Trusted by thousands of Ghanaians every day</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <div className="flex mb-3">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <span key={i} className="text-yellow-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-gray-600 text-sm mb-4 italic">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-black">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{t.name}</p>
                    <p className="text-gray-400 text-xs">{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent banner — hidden when visitor came via referral link */}
      <AgentAwareSection>
      <section className="py-14 px-4 bg-gradient-to-r from-blue-800 to-blue-600 text-white">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-black mb-2">Earn Money as an Elite Data Agent</h2>
            <p className="text-blue-200">Share your referral link — earn 80% profit on every bundle sold through it. Free to join.</p>
          </div>
          <Link href="/agent"
            className="shrink-0 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-8 py-3.5 rounded-xl transition-colors shadow-lg whitespace-nowrap">
            Become an Agent →
          </Link>
        </div>
      </section>
      </AgentAwareSection>

      {/* FAQ */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-gray-800 mb-2">Frequently Asked Questions</h2>
            <p className="text-gray-500">Everything you need to know</p>
          </div>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="bg-white rounded-2xl border border-gray-100 shadow-sm group">
                <summary className="px-5 py-4 font-bold text-gray-800 cursor-pointer flex items-center justify-between list-none">
                  {f.q}
                  <span className="text-blue-500 text-xl group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="px-5 pb-4 text-gray-500 text-sm border-t border-gray-50 pt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 py-16 px-4 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black mb-3">Ready to Buy Data?</h2>
          <p className="text-blue-100 mb-7">Join 30,000+ Ghanaians who trust Elite Data for their daily internet needs.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/buy" className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black px-10 py-4 rounded-xl text-lg transition-colors shadow-lg inline-block">
              Buy Data Now ⚡
            </Link>
            <a href="https://wa.me/233509794503" target="_blank" rel="noreferrer"
              className="bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors inline-block">
              WhatsApp Support
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
