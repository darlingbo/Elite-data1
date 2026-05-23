import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";
import { bundles } from "@/lib/bundles";

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  // Merge static + DB bundles (same logic as /api/bundles)
  const { data: dbBundles } = await supabase
    .from("bundle_prices")
    .select("id, network, size_label, size_gb, price, active")
    .eq("active", true)
    .order("network")
    .order("price");

  const dbIds = new Set((dbBundles ?? []).map((b) => b.id));

  const staticMapped = bundles
    .filter((b) => !dbIds.has(b.id))
    .map((b) => ({ id: b.id, network: b.network, size: b.size, sizeGB: b.sizeGB, price: b.price, validity: b.validity }));

  const dbMapped = (dbBundles ?? []).map((b) => ({
    id: b.id,
    network: b.network,
    size: b.size_label ?? b.id,
    sizeGB: b.size_gb ?? 1,
    price: b.price,
    validity: bundles.find((s) => s.id === b.id)?.validity ?? "30 days",
  }));

  return NextResponse.json({ bundles: [...dbMapped, ...staticMapped] });
}
