import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import PublicNav from "@/components/PublicNav";
import MobileBottomNav from "@/components/MobileBottomNav";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import WelcomePopup from "@/components/WelcomePopup";
import ThemeToggle from "@/components/ThemeToggle";
import ChatWidget from "@/components/ChatWidget";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { supabase } from "@/lib/supabase";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./mobile.css";
import "./mobile-header.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1b2e",
};

const PAGE_SEO: Record<string, { title: string; description: string; keywords: string[] }> = {
  "/": { title: "Buy Data Bundles & Result Checker Vouchers in Ghana | Elite Data", description: "Buy affordable MTN, Telecel and AirtelTigo data bundles plus BECE and WASSCE result checker vouchers online in Ghana. Secure Paystack payment and order tracking.", keywords: ["buy data bundle Ghana", "cheap data bundles Ghana", "result checker Ghana", "BECE result checker", "WASSCE result checker"] },
  "/buy": { title: "Buy MTN, Telecel & AirtelTigo Data Bundles Ghana | Elite Data", description: "Buy affordable MTN, Telecel and AirtelTigo data bundles online in Ghana. Choose a bundle, pay securely with Mobile Money or card, and track your order.", keywords: ["buy MTN data Ghana", "buy Telecel data Ghana", "buy AirtelTigo data Ghana", "data bundle Ghana"] },
  "/prices": { title: "Data Bundle Prices in Ghana — MTN, Telecel & AirtelTigo", description: "Compare current Elite Data bundle prices for MTN, Telecel and AirtelTigo in Ghana, then choose and buy the bundle that fits your budget.", keywords: ["MTN data bundle prices Ghana", "Telecel data prices", "AirtelTigo bundle prices", "cheap data Ghana"] },
  "/vouchers": { title: "Buy BECE & WASSCE Result Checker Vouchers Online Ghana", description: "Buy BECE and WASSCE result checker vouchers online in Ghana. Pay securely and receive available voucher details by SMS after order approval.", keywords: ["buy BECE result checker", "buy WASSCE result checker", "result checker voucher Ghana", "WAEC result checker Ghana"] },
  "/track": { title: "Track Your Data Bundle Order | Elite Data Ghana", description: "Track your Elite Data order in real time. Enter your order reference to check delivery status for MTN, Telecel and AirtelTigo bundles.", keywords: ["track data bundle order Ghana", "Elite Data order tracking", "data order status Ghana"] },
  "/business": { title: "Business & Bulk Data Top-Up Ghana | Elite Data", description: "Affordable bulk data top-up for businesses and resellers in Ghana. MTN, Telecel and AirtelTigo data bundles at the best wholesale prices.", keywords: ["bulk data Ghana", "business data bundles Ghana", "wholesale data bundles Ghana", "data reseller Ghana"] },
  "/agent": { title: "Become a Data Bundle Agent in Ghana | Elite Data", description: "Join Elite Data as an agent and earn commission on every data bundle you sell. Free and Pro plans available. Apply today.", keywords: ["become data agent Ghana", "data reseller agent Ghana", "earn selling data Ghana", "Elite Data agent"] },
  "/leaderboard": { title: "Top Agent Leaderboard | Elite Data Ghana", description: "See Elite Data's top-performing agents ranked by total sales. Join our agent programme and get on the board.", keywords: ["Elite Data leaderboard", "top agents Ghana", "data agent ranking Ghana"] },
  "/privacy": { title: "Privacy Policy | Elite Data Ghana", description: "Read how Elite Data collects, uses and protects your personal information when you buy data bundles in Ghana.", keywords: ["Elite Data privacy policy", "data privacy Ghana"] },
  "/refund-policy": { title: "Refund Policy | Elite Data Ghana", description: "Understand Elite Data's refund policy for failed or undelivered data bundle orders in Ghana.", keywords: ["Elite Data refund policy", "data bundle refund Ghana"] },
  "/agent-agreement": { title: "Agent Agreement | Elite Data Ghana", description: "Read the full terms and conditions for Elite Data agents in Ghana before signing up.", keywords: ["Elite Data agent terms", "data agent agreement Ghana"] },
};

export async function generateMetadata(): Promise<Metadata> {
  const store = await headers();
  const pathname = store.get("x-pathname") ?? "/";
  const seo = PAGE_SEO[pathname] ?? PAGE_SEO["/"];
  return {
  title: seo.title,
  description: seo.description,
  keywords: [
    "data bundles Ghana", "cheap data Ghana", "MTN data bundle", "Telecel data", "AirtelTigo data",
    "buy data Ghana", "data bundle Ghana", "Ghana internet data", "cheap internet Ghana",
    "Elite Data Ghana", "elitedata1", "data reseller Ghana", ...seo.keywords,
  ],
  metadataBase: new URL("https://elitedata1.com"),
  alternates: { canonical: pathname },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Elite Data",
  },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://elitedata1.com${pathname === "/" ? "" : pathname}`,
    siteName: "Elite Data",
    locale: "en_GH",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Elite Data — Cheap Data Bundles in Ghana" }],
  },
  twitter: {
    card: "summary_large_image",
    title: seo.title,
    description: seo.description,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  };
}

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
  const nonce = headersList.get("x-nonce") ?? undefined;
  const isAdmin = pathname.startsWith("/admin");
  const isAgent = pathname.startsWith("/agent");
  const isSubAdmin = pathname.startsWith("/subadmin");
  const isStandalone = isAdmin || isAgent || isSubAdmin;
  const helplineEnabled = isStandalone ? false : await getHelplineEnabled();
  const bodyModeClass = isAdmin ? "admin-site" : isAgent ? "agent-site" : isSubAdmin ? "subadmin-site" : "public-site";

  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className={`min-h-screen flex flex-col bg-gray-50 text-gray-900 ${bodyModeClass} ${isStandalone ? "workspace-shell" : "site-shell"}`} data-helpline={helplineEnabled ? "on" : "off"}>
        <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": "https://elitedata1.com/#organization", name: "Elite Data Ghana", url: "https://elitedata1.com", logo: "https://elitedata1.com/logo.png", contactPoint: { "@type": "ContactPoint", telephone: "+233509794503", contactType: "customer service", areaServed: "GH" } },
            { "@type": "WebSite", "@id": "https://elitedata1.com/#website", name: "Elite Data", alternateName: "EliteData1", url: "https://elitedata1.com", publisher: { "@id": "https://elitedata1.com/#organization" } },
            ...(pathname === "/vouchers" ? [{ "@type": "ItemList", name: "Result Checker Vouchers", itemListElement: [
              { "@type": "ListItem", position: 1, item: { "@type": "Product", name: "BECE Result Checker Voucher", url: "https://elitedata1.com/vouchers", category: "Exam result checker voucher" } },
              { "@type": "ListItem", position: 2, item: { "@type": "Product", name: "WASSCE Result Checker Voucher", url: "https://elitedata1.com/vouchers", category: "Exam result checker voucher" } },
            ] }] : []),
          ],
        }).replace(/</g, "\\u003c") }} />
        {!isStandalone && <PublicNav />}
        {!isStandalone && <AnnouncementBanner target="customers" />}
        <main className="flex-1">{children}</main>
        {!isStandalone && <Footer />}
        {!isStandalone && helplineEnabled && <WhatsAppButton />}
        {!isStandalone && <WelcomePopup />}
        {!isStandalone && <ChatWidget />}
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
