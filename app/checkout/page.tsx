"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CheckoutModal from "@/components/CheckoutModal";
import type { Bundle } from "@/lib/bundles";

type MashupBundle = { id: string; name: string; data_value: number; data_unit: string; minutes: number; price: number };

function CheckoutContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bundleId = params.get("bundle") ?? "";
  const agentCode = params.get("agent") ?? undefined;
  const referralVia = params.get("via") ?? undefined;
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!bundleId) { setError("No bundle was selected."); return; }
    const bundleUrl = agentCode ? `/api/bundles?agent=${encodeURIComponent(agentCode)}` : "/api/bundles";
    Promise.all([
      fetch(bundleUrl).then(response => response.json()),
      fetch("/api/mashup-bundles").then(response => response.json()).catch(() => ({ bundles: [] })),
    ]).then(([standard, mashup]: [{ bundles?: Bundle[] }, { bundles?: MashupBundle[] }]) => {
      const standardMatch = (standard.bundles ?? []).find(item => item.id === bundleId);
      if (standardMatch) { setBundle(standardMatch); return; }
      const mashupMatch = (mashup.bundles ?? []).find(item => item.id === bundleId);
      if (mashupMatch) {
        setBundle({
          id: mashupMatch.id,
          network: "mtn",
          size: mashupMatch.minutes > 0 ? `${mashupMatch.data_value}${mashupMatch.data_unit} + ${mashupMatch.minutes}min` : `${mashupMatch.data_value}${mashupMatch.data_unit}`,
          sizeGB: mashupMatch.data_unit === "MB" ? mashupMatch.data_value / 1024 : mashupMatch.data_value,
          price: mashupMatch.price,
          costPrice: 0,
          validity: "30 days",
        });
        return;
      }
      setError("This bundle is no longer available. Please choose another one.");
    }).catch(() => setError("Checkout could not load. Please try again."));
  }, [agentCode, bundleId]);

  const buyHref = `/buy${agentCode ? `?agent=${encodeURIComponent(agentCode)}` : ""}`;

  if (error) return (
    <main className="min-h-screen bg-[#070d19] px-5 py-16 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-2xl">!</div>
        <h1 className="text-2xl font-black">Checkout unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{error}</p>
        <Link href={buyHref} className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Choose a bundle</Link>
      </div>
    </main>
  );

  if (!bundle) return (
    <main className="grid min-h-screen place-items-center bg-[#070d19]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500/25 border-t-blue-500" />
    </main>
  );

  return (
    <main className="checkout-page min-h-screen bg-[#070d19] text-slate-100">
      <header className="border-b border-white/10 bg-[#070d19]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3 text-white no-underline">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 font-black">E</span>
            <span><b className="block text-sm">Elite Data</b><small className="text-[10px] uppercase tracking-[.2em] text-slate-500">Secure checkout</small></span>
          </Link>
          <Link href={buyHref} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">← Change bundle</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:py-14">
        <section className="order-last lg:order-none">
          <p className="text-xs font-black uppercase tracking-[.22em] text-blue-400">Complete your purchase</p>
          <h1 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-5xl">Fast data, clear pricing, secure payment.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">Review your bundle and enter the receiving number. Payment is processed securely by Paystack and your order enters our monitored approval queue.</p>

          <div className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-[#14223a] to-[#0d1728] p-6 shadow-2xl shadow-black/25 sm:p-8">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Selected bundle</p>
                <h2 className="mt-2 text-4xl font-black text-white">{bundle.size}</h2>
                <p className="mt-2 text-sm text-slate-400">{bundle.network === "airteltigo" ? "AirtelTigo" : bundle.network.charAt(0).toUpperCase() + bundle.network.slice(1)} · {bundle.validity}</p>
              </div>
              <div className="rounded-2xl bg-blue-500/15 px-4 py-3 text-right">
                <small className="block text-[10px] uppercase tracking-wider text-blue-300">Bundle price</small>
                <strong className="mt-1 block text-2xl text-white">GH₵{bundle.price.toFixed(2)}</strong>
              </div>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[['🔒','Secure payment','Paystack protected'],['✓','Verified order','Payment checked'],['💬','Customer support','Help when needed']].map(([icon,title,copy]) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/[.035] p-4">
                  <span className="text-lg">{icon}</span><b className="mt-2 block text-xs text-white">{title}</b><small className="mt-1 block text-[11px] text-slate-500">{copy}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>🔐 Encrypted connection</span><span>📱 Ghana numbers supported</span><span>🧾 Order reference provided</span>
          </div>
        </section>

        <section className="order-first overflow-hidden rounded-3xl bg-white text-slate-900 shadow-[0_30px_100px_rgba(0,0,0,.35)] lg:order-none">
          <div className="border-b border-slate-100 px-6 py-5">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-600">Customer details</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Where should we send the bundle?</h2>
            <p className="mt-1 text-xs text-slate-500">Fill in your name and receiving phone number below.</p>
          </div>
          <CheckoutModal bundle={bundle} agentCode={agentCode} referralVia={referralVia} displayMode="page" onClose={() => router.push(buyHref)} />
        </section>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#070d19]" />}><CheckoutContent /></Suspense>;
}
