import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles, sizeLabel, Bundle } from "@/lib/bundles";
import { publicCache } from "@/lib/public-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: overrides, error } = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active, size_label, size_gb, validity, network");

  if (error) {
    console.error("[bundles] Supabase bundle_prices query error:", error.message, error.code);
  }

  const rows = overrides ?? [];
  const overrideMap = new Map(rows.map((o: { id: string }) => [o.id, o]));
  const defaultIds = new Set(defaultBundles.map((b) => b.id));

  const defaultFiltered = defaultBundles
    .filter((b) => {
      const ov = overrideMap.get(b.id) as { active?: boolean } | undefined;
      return ov ? ov.active !== false : true;
    })
    .map((b) => {
      const ov = overrideMap.get(b.id) as { price?: number; cost_price?: number; size_label?: string; size_gb?: number; validity?: string } | undefined;
      if (!ov) return b;
      const sizeGB = ov.size_gb ?? b.sizeGB;
      const size = ov.size_label ?? (ov.size_gb != null ? sizeLabel(sizeGB) : b.size);
      return {
        ...b,
        price: ov.price ?? b.price,
        costPrice: ov.cost_price ?? b.costPrice,
        size,
        sizeGB,
        validity: ov.validity ?? b.validity,
      };
    });

  const customBundles = rows
    .filter((o: { id: string; network?: string; active?: boolean }) =>
      !defaultIds.has(o.id) && o.network && o.active !== false
    )
    .map((o: { id: string; network: string; size_label?: string; size_gb?: number; validity?: string; price: number; cost_price: number }) => ({
      id: o.id,
      network: o.network as "mtn" | "telecel" | "airteltigo",
      size: o.size_label ?? o.id,
      sizeGB: o.size_gb ?? 1,
      validity: o.validity ?? "30 days",
      price: o.price,
      costPrice: o.cost_price,
    }));

  // Deduplicate by network and sizeGB:
  // 1. Static default bundles serve as the baseline/fallback.
  // 2. Active custom bundles from the database take precedence over static bundles.
  const bundleMap = new Map<string, Bundle>();

  for (const b of defaultFiltered) {
    bundleMap.set(`${b.network}:${b.sizeGB}`, b);
  }

  for (const cb of customBundles) {
    bundleMap.set(`${cb.network}:${cb.sizeGB}`, cb);
  }

  const netOrder: Record<string, number> = { mtn: 0, telecel: 1, airteltigo: 2 };
  const allBundles = Array.from(bundleMap.values()).sort((a, b) => {
    const netDiff = (netOrder[a.network] ?? 9) - (netOrder[b.network] ?? 9);
    if (netDiff !== 0) return netDiff;
    return (a.sizeGB ?? 0) - (b.sizeGB ?? 0);
  });

  // Prices: short cache so an admin price change reaches customers within a minute.
  // Don't cache a failed price lookup (we'd be serving fallback prices).
  return Response.json({ bundles: allBundles }, error ? undefined : { headers: publicCache(30) });
}
