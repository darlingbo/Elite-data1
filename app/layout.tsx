import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ChatWidget from "@/components/ChatWidget";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Elite Data — Cheap Data Bundles in Ghana | MTN, Telecel, AirtelTigo",
  description:
    "Buy cheap and instant data bundles in Ghana. MTN, Telecel and AirtelTigo bundles at the best prices. Fast delivery, secure payments.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const isStandalone = pathname.startsWith("/admin") || pathname.startsWith("/agent/dashboard") || pathname.startsWith("/agent");

  return (
    <html lang="en" className={geist.className}>
      <body className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
        {!isStandalone && <PublicNav />}
        <main className="flex-1">{children}</main>
        {!isStandalone && <Footer />}
        {!isStandalone && <WhatsAppButton />}
        {!isStandalone && <ChatWidget />}
      </body>
    </html>
  );
}
