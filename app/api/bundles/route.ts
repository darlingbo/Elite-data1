import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles } from "@/lib/bundles";

export async function GET() {
  const { data: overrides } = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active, size_label, size_gb, validity, network");

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
      return {
        ...b,
        price: ov.price ?? b.price,
        costPrice: ov.cost_price ?? b.costPrice,
        size: ov.size_label ?? b.size,
        sizeGB: ov.size_gb ?? b.sizeGB,
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

  return Response.json({ bundles: [...defaultFiltered, ...customBundles] });
}
