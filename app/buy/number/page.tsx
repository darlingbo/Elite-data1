import { redirect } from "next/navigation";

/**
 * The number is now entered on the checkout screen, so this old address just
 * sends people to the bundle list (or straight to checkout when a bundle is given).
 */
export default async function NumberStepMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const bundle = one(sp.bundle);
  const network = one(sp.network);
  const via = one(sp.via);
  const q = new URLSearchParams();
  if (via) q.set("via", via);
  if (bundle) {
    q.set("bundle", bundle);
    redirect(`/checkout?${q.toString()}`);
  }
  if (network) q.set("network", network);
  redirect(`/buy${q.toString() ? `?${q.toString()}` : ""}`);
}
