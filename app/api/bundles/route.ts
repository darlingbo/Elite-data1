import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles } from "@/lib/bundles";

export async function GET() {
  // Fetch any admin price overrides from DB
  const { data: overrides } = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active");

  const overrideMap = new Map(
    (overrides ?? []).map((o: { id: string; price: number; cost_price: number; active: boolean }) => [o.id, o])
  );

  const bundles = defaultBundles.map((b) => {
    const ov = overrideMap.get(b.id);
    if (ov && ov.active) {
      return { ...b, price: ov.price, costPrice: ov.cost_price };
    }
    return b;
  });

  return Response.json({ bundles });
}
