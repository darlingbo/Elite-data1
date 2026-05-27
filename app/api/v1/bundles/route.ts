import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { bundles, sizeLabel } from "@/lib/bundles";

// API price = costPrice * 1.06 (admin earns 6% markup over cost)
function apiPrice(costPrice: number): number {
  return parseFloat((costPrice * 1.06).toFixed(2));
}

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { data: dbBundles } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, cost_price, active")
    .eq("active", true)
    .order("network")
    .order("price");

  const dbIds = new Set((dbBundles ?? []).map((b) => b.id));

  const staticMapped = bundles
    .filter((b) => !dbIds.has(b.id))
    .map((b) => ({
      id: b.id,
      network: b.network,
      size: b.size,
      sizeGB: b.sizeGB,
      api_price: apiPrice(b.costPrice),
      retail_price: b.price,
      validity: b.validity,
    }));

  const dbMapped = (dbBundles ?? []).map((b) => {
    const staticMatch = bundles.find((s) => s.id === b.id);
    const sizeGB = b.size_gb ?? staticMatch?.sizeGB ?? 1;
    const size = b.size_label ?? (b.size_gb != null ? sizeLabel(sizeGB) : (staticMatch?.size ?? b.id));
    const costPrice = b.cost_price ?? staticMatch?.costPrice ?? 0;
    return {
      id: b.id,
      network: b.network ?? staticMatch?.network ?? "mtn",
      size,
      sizeGB,
      api_price: apiPrice(costPrice),
      retail_price: b.price,
      validity: staticMatch?.validity ?? "30 days",
    };
  });

  return NextResponse.json({
    bundles: [...dbMapped, ...staticMapped],
    note: "Use api_price as the cost that will be deducted from your wallet per order.",
  });
}
