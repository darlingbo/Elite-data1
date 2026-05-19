import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles } from "@/lib/bundles";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try fetching with metadata columns first; fall back if they don't exist yet
  let overrides: { id: string; price: number; cost_price: number; active: boolean; size_label?: string; size_gb?: number; validity?: string }[] = [];

  const fullRes = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active, size_label, size_gb, validity");

  if (!fullRes.error) {
    overrides = fullRes.data ?? [];
  } else {
    // Columns don't exist yet — fall back to base columns only
    const baseRes = await supabase
      .from("bundle_prices")
      .select("id, price, cost_price, active");
    overrides = baseRes.data ?? [];
  }

  const overrideMap = new Map(overrides.map((o) => [o.id, o]));

  const bundles = defaultBundles.map((b) => {
    const ov = overrideMap.get(b.id);
    return {
      id: b.id,
      network: b.network,
      size: ov?.size_label ?? b.size,
      sizeGB: ov?.size_gb ?? b.sizeGB,
      validity: ov?.validity ?? b.validity,
      price: ov ? ov.price : b.price,
      costPrice: ov ? ov.cost_price : b.costPrice,
      active: ov ? ov.active !== false : true,
      hasOverride: !!ov,
    };
  });

  return Response.json({ bundles });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bundleId, price, costPrice, active, sizeLabel, sizeGB, validity } = body;

  if (!bundleId) {
    return Response.json({ error: "bundleId is required." }, { status: 400 });
  }

  const valid = defaultBundles.find((b) => b.id === bundleId);
  if (!valid) {
    return Response.json({ error: "Invalid bundle ID." }, { status: 400 });
  }

  // Toggle active only — never include metadata columns here
  if (typeof active === "boolean" && price === undefined) {
    const { data: existing } = await supabase
      .from("bundle_prices")
      .select("price, cost_price")
      .eq("id", bundleId)
      .maybeSingle();

    const { error } = await supabase.from("bundle_prices").upsert({
      id: bundleId,
      price: existing?.price ?? valid.price,
      cost_price: existing?.cost_price ?? valid.costPrice,
      active,
      updated_at: new Date().toISOString(),
    });
    if (error) return Response.json({ error: "Failed to update." }, { status: 500 });
    return Response.json({ success: true });
  }

  // Price update
  if (typeof price !== "number" || typeof costPrice !== "number" || isNaN(price) || isNaN(costPrice)) {
    return Response.json({ error: "price and costPrice required." }, { status: 400 });
  }
  if (price <= 0 || costPrice <= 0) {
    return Response.json({ error: "Prices must be greater than 0." }, { status: 400 });
  }
  if (costPrice >= price) {
    return Response.json({ error: "Cost price must be less than selling price." }, { status: 400 });
  }

  if (sizeGB !== undefined && (typeof sizeGB !== "number" || isNaN(sizeGB) || sizeGB <= 0)) {
    return Response.json({ error: "sizeGB must be a positive number." }, { status: 400 });
  }

  // Preserve existing active state if not explicitly provided
  let resolvedActive: boolean;
  if (typeof active === "boolean") {
    resolvedActive = active;
  } else {
    const { data: existing } = await supabase
      .from("bundle_prices")
      .select("active")
      .eq("id", bundleId)
      .maybeSingle();
    resolvedActive = existing ? existing.active !== false : true;
  }

  // Build upsert — always include price fields; only include metadata if provided
  const upsertData: Record<string, unknown> = {
    id: bundleId,
    price,
    cost_price: costPrice,
    active: resolvedActive,
    updated_at: new Date().toISOString(),
  };

  const hasMetadata = sizeLabel !== undefined || sizeGB !== undefined || validity !== undefined;

  if (hasMetadata) {
    // Try with metadata columns; if they don't exist, fall back to price-only
    if (sizeLabel !== undefined) upsertData.size_label = sizeLabel || null;
    if (sizeGB !== undefined) upsertData.size_gb = sizeGB;
    if (validity !== undefined) upsertData.validity = validity || null;

    const { error } = await supabase.from("bundle_prices").upsert(upsertData);
    if (error) {
      // Metadata columns don't exist yet — save price/active only and warn
      const { error: fallbackError } = await supabase.from("bundle_prices").upsert({
        id: bundleId,
        price,
        cost_price: costPrice,
        active: resolvedActive,
        updated_at: new Date().toISOString(),
      });
      if (fallbackError) return Response.json({ error: "Failed to update price." }, { status: 500 });
      return Response.json({ success: true, warning: "Prices saved. Run the Supabase SQL migration to enable size/validity editing." });
    }
    return Response.json({ success: true });
  }

  // No metadata — straightforward price update
  const { error } = await supabase.from("bundle_prices").upsert(upsertData);
  if (error) return Response.json({ error: "Failed to update price." }, { status: 500 });
  return Response.json({ success: true });
}
