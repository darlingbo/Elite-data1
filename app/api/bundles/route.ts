import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles } from "@/lib/bundles";

export async function GET() {
  const { data: overrides } = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active, size_label, size_gb, validity");

  const overrideMap = new Map(
    (overrides ?? []).map((o: { id: string; price: number; cost_price: number; active: boolean; size_label?: string; size_gb?: number; validity?: string }) => [o.id, o])
  );

  const bundles = defaultBundles
    .filter((b) => {
      const ov = overrideMap.get(b.id);
      return ov ? ov.active !== false : true;
    })
    .map((b) => {
      const ov = overrideMap.get(b.id);
      if (!ov) return b;
      return {
        ...b,
        price: ov.price,
        costPrice: ov.cost_price,
        size: ov.size_label ?? b.size,
        sizeGB: ov.size_gb ?? b.sizeGB,
        validity: ov.validity ?? b.validity,
      };
    });

  return Response.json({ bundles });
}
