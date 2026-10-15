import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStoreStatus } from "@/lib/store-status";
import { ALTERNATE_STORE_LABEL, ALTERNATE_STORE_URL } from "@/lib/store-closed";

// Shown by proxy.ts (as a rewrite, so the visitor keeps the URL they asked for)
// while the admin "Close Store" switch is on.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Temporarily Closed | Elite Data Ghana",
  robots: { index: false, follow: false },
};

const D = { bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#e6edf3", muted: "#8b949e" };

export default async function StoreClosedPage() {
  const store = await getStoreStatus();
  // Someone opened /store-closed directly while the store is open.
  if (store.open) redirect("/");

  return (
    <div
      className="flex items-center justify-center px-4 py-10"
      style={{ background: D.bg, minHeight: "100vh", color: D.text, fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="w-full max-w-md text-center space-y-4">
        <p className="text-xs font-semibold" style={{ color: D.muted }}>Elite Data Ghana</p>
        <h1 className="text-2xl font-black">We&apos;re temporarily closed</h1>

        <div className="p-6 space-y-4" style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: 16 }}>
          <p className="text-sm whitespace-pre-line">{store.message}</p>
          <a
            href={ALTERNATE_STORE_URL}
            className="block w-full bg-blue-600 hover:bg-blue-700 active:opacity-75 text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            Buy data at {ALTERNATE_STORE_LABEL}
          </a>
        </div>

        <p className="text-xs" style={{ color: D.muted }}>
          Already placed an order?{" "}
          <Link href="/track" className="font-semibold underline py-3 inline-block">Track it here</Link>
        </p>
      </div>
    </div>
  );
}
