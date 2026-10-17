import Link from "next/link";
import HomePopular from "@/components/ed/HomePopular";
import HomeRecents from "@/components/ed/HomeRecents";
import Icon from "@/components/ed/Icon";
import { NETWORK_META } from "@/lib/ed-networks";
import { supabase } from "@/lib/supabase";

const networks = (["mtn", "telecel", "airteltigo"] as const).map((id) => NETWORK_META[id]);

const features = [
  { title: "Automated delivery", desc: "Verified orders are fulfilled automatically within minutes, straight to the recipient." },
  { title: "Mobile Money only", desc: "You get a prompt on your own phone and approve it with your PIN. No card details to type." },
  { title: "Numbers checked first", desc: "We check the receiving number before you pay, so data does not go to a number that cannot take it." },
  { title: "Human support", desc: "Message our Accra team on WhatsApp whenever you need help." },
  { title: "Delivery guarantee", desc: "Full refund or a fresh delivery if a network outage ever stops your order." },
];

const stats = [
  { value: "45,000+", label: "customers served" },
  { value: "180,000+", label: "orders fulfilled" },
  { value: "3", label: "Ghana networks" },
  { value: "99.9%", label: "delivery success" },
];

const howItWorks = [
  { title: "Pick a network", desc: "MTN, Telecel or AirtelTigo, then any size from 1GB up to 40GB." },
  { title: "Type the number", desc: "The number that gets the data. We check it before you pay." },
  { title: "Approve on MoMo", desc: "Choose your Mobile Money network, type your number and enter your PIN on the prompt." },
  { title: "Data arrives", desc: "You get an SMS, and you can follow the order live on the Track page." },
];

const faqs = [
  { q: "How fast is data delivery?", a: "Most bundles arrive within 1 to 3 minutes of payment approval. You can follow the live progress on the Track Order page." },
  { q: "Can I buy data for another person?", a: "Yes. Type that person's number as the number that gets the data. You pay from your own Mobile Money number, which can be different." },
  { q: "Which payment methods do you accept?", a: "Mobile Money only: MTN MoMo, Telecel Cash and AirtelTigo Money. You approve a prompt on your own phone." },
  { q: "Why does my number need to be verified?", a: "MTN only delivers data to numbers that are registered with its data partners. If your number is new, we show you where to submit it. Once it is verified, come back and buy." },
  { q: "What happens if there is a network error?", a: "If a network has downtime, our team is told straight away. Your order is delivered by hand or refunded in full." },
  { q: "How do I track my order?", a: "Every purchase gets a reference like YBK-123456. Open the Track Order page and enter it to see the live status." },
];

type LastDelivery = { minutes: number; label: string };

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

    const minutes = Math.round((new Date(data.completed_at).getTime() - new Date(data.created_at).getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) return null;

    return { minutes, label: `${(data.network ?? "").toUpperCase()} ${data.bundle_size ?? ""}`.trim() };
  } catch {
    return null;
  }
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
    <div className="ed-page">
      <div className="ed-wrap wide ed-stack" style={{ paddingTop: 18, paddingBottom: 32, gap: 16 }}>
        <h1 className="ed-sr">Buy MTN, Telecel and AirtelTigo data bundles in Ghana</h1>

        {lastDelivery && (
          <div className="ed-live"><i />Open now. Last order, {lastDelivery.label}, arrived in {fmtDuration(lastDelivery.minutes)}</div>
        )}

        <p className="ed-h1" aria-hidden="true">Pick your network.</p>

        <div className="ed-bars">
          {networks.map((n) => (
            <Link key={n.id} href={`/buy/number?network=${n.id}`} className={`ed-bar ${n.id}`}>
              <span className="go"><Icon name="arrow" /></span>
              <span className="name">{n.label}</span>
              <span className="tag">{n.tagline}</span>
            </Link>
          ))}
        </div>

        <HomeRecents />
      </div>

      <div className="ed-wrap wide">
        <div className="ed-section"><HomePopular /></div>

        <section className="ed-section" aria-labelledby="vouchers-heading">
          <div className="ed-vcard">
            <h3 id="vouchers-heading">BECE and WASSCE result checkers</h3>
            <p>Official WAEC result checker PINs and serial numbers, sent to your phone by SMS within about a minute. Each voucher is valid for 3 checks.</p>
            <Link href="/vouchers" className="ed-btn y">Buy a result checker</Link>
          </div>
        </section>

        <section className="ed-section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="ed-h2">How it works</h2>
          <div className="ed-how" style={{ marginTop: 8 }}>
            {howItWorks.map((s, i) => (
              <div key={s.title}><i>{i + 1}</i><span><b>{s.title}</b>{s.desc}</span></div>
            ))}
          </div>
        </section>

        <section className="ed-section" aria-labelledby="why-heading">
          <h2 id="why-heading" className="ed-h2" style={{ marginBottom: 16 }}>Why Elite Data</h2>
          <ul className="ed-why">
            {features.map((f) => (
              <li key={f.title}><b>{f.title}</b><span>{f.desc}</span></li>
            ))}
          </ul>
        </section>

        <section className="ed-section" aria-label="Customer review">
          <div className="ed-quote">
            &ldquo;I ordered MTN 5GB for GH₵25 and my data came in under 2 minutes. Best data service in Ghana by far.&rdquo;
            <small>Kwame M., Accra</small>
          </div>
        </section>

        <section className="ed-section ed-faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="ed-h2" style={{ marginBottom: 8 }}>Questions</h2>
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="ed-section" style={{ paddingBottom: 12 }}>
          <p className="ed-muted" style={{ margin: 0, fontSize: 13, display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
            {stats.map((s) => (<span key={s.label}><b style={{ color: "var(--ed-text)" }}>{s.value}</b> {s.label}</span>))}
          </p>
        </section>
      </div>
    </div>
  );
}
