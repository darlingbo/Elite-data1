import type { Metadata } from "next";
import { headers } from "next/headers";
import PublicNav from "@/components/PublicNav";
import MobileBottomNav from "@/components/MobileBottomNav";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import WelcomePopup from "@/components/WelcomePopup";
import ThemeToggle from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Elite Data — Cheap Data Bundles in Ghana | MTN, Telecel, AirtelTigo",
  description:
    "Buy cheap and instant data bundles in Ghana. MTN, Telecel and AirtelTigo bundles at the best prices. Fast delivery, secure payments via Paystack.",
  keywords: [
    "data bundles Ghana", "cheap data Ghana", "MTN data bundle", "Telecel data", "AirtelTigo data",
    "buy data Ghana", "data bundle Ghana", "Ghana internet data", "cheap internet Ghana",
    "Elite Data Ghana", "elitedata1", "data reseller Ghana",
  ],
  metadataBase: new URL("https://www.elitedata1.com"),
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Elite Data",
  },
  openGraph: {
    title: "Elite Data — Cheap Data Bundles in Ghana",
    description: "MTN, Telecel & AirtelTigo bundles at the best prices. Instant delivery, secure payment.",
    url: "https://www.elitedata1.com",
    siteName: "Elite Data",
    locale: "en_GH",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Elite Data — Cheap Data Bundles in Ghana" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Elite Data — Cheap Data Bundles in Ghana",
    description: "MTN, Telecel & AirtelTigo bundles at the best prices. Instant delivery.",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

async function getHelplineEnabled(): Promise<boolean> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "helpline_enabled").maybeSingle();
    return data?.value !== "false";
  } catch {
    return true;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const isAdmin = pathname.startsWith("/admin");
  const isAgent = pathname.startsWith("/agent");
  const isStandalone = isAdmin || isAgent;
  const helplineEnabled = isStandalone ? false : await getHelplineEnabled();
  const bodyModeClass = isAdmin ? "admin-site" : isAgent ? "agent-site" : "public-site";

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0d1b2e" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className={`min-h-screen flex flex-col bg-gray-50 text-gray-900 ${bodyModeClass}`} data-helpline={helplineEnabled ? "on" : "off"}>
        {!isStandalone && <PublicNav />}
        <main className="flex-1">{children}</main>
        {!isStandalone && <Footer />}
        {!isStandalone && helplineEnabled && <WhatsAppButton />}
        {!isStandalone && <WelcomePopup />}
        {!isStandalone && <MobileBottomNav />}
        {isAgent && (
          <div className="agent-theme-toggle" style={{ position: "fixed", top: 14, right: 16, zIndex: 99999 }}>
            <ThemeToggle />
          </div>
        )}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
