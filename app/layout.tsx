import type { Metadata } from "next";
import { headers } from "next/headers";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import WelcomePopup from "@/components/WelcomePopup";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const isStandalone = pathname.startsWith("/admin") || pathname.startsWith("/agent/dashboard") || pathname.startsWith("/agent");

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
        {!isStandalone && <PublicNav />}
        <main className="flex-1">{children}</main>
        {!isStandalone && <Footer />}
        {!isStandalone && <WhatsAppButton />}
        {!isStandalone && <WelcomePopup />}
        {/* On standalone pages (admin/agent) the nav is absent so we float the toggle */}
        {isStandalone && (
          <div style={{ position: "fixed", top: 14, right: 16, zIndex: 99999 }}>
            <ThemeToggle />
          </div>
        )}
      </body>
    </html>
  );
}
