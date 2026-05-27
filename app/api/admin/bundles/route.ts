import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { bundles as defaultBundles, sizeLabel } from "@/lib/bundles";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

type DbBundle = {
  id: string; price: number; cost_price: number; active: boolean;
  size_label?: string; size_gb?: number; validity?: string; network?: string;
};

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let overrides: DbBundle[] = [];

  const fullRes = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active, size_label, size_gb, validity, network");

  if (!fullRes.error) {
    overrides = fullRes.data ?? [];
  } else {
    const baseRes = await supabase.from("bundle_prices").select("id, price, cost_price, active");
    overrides = baseRes.data ?? [];
  }

  const overrideMap = new Map(overrides.map((o) => [o.id, o]));
  const defaultIds = new Set(defaultBundles.map((b) => b.id));

  const defaultRows = defaultBundles.map((b) => {
    const ov = overrideMap.get(b.id);
    return {
      id: b.id,
      network: b.network,
      sizeGB: ov?.size_gb ?? b.sizeGB,
      size: ov?.size_label ?? (ov?.size_gb != null ? sizeLabel(ov.size_gb) : b.size),
      validity: ov?.validity ?? b.validity,
      price: ov ? ov.price : b.price,
      costPrice: ov ? ov.cost_price : b.costPrice,
      active: ov ? ov.active !== false : true,
      hasOverride: !!ov,
      isCustom: false,
    };
  });

  const customRows = overrides
    .filter((o) => !defaultIds.has(o.id) && o.network)
    .map((o) => ({
      id: o.id,
      network: o.network!,
      size: o.size_label ?? o.id,
      sizeGB: o.size_gb ?? 1,
      validity: o.validity ?? "30 days",
      price: o.price,
      costPrice: o.cost_price,
      active: o.active !== false,
      hasOverride: true,
      isCustom: true,
    }));

  return Response.json({ bundles: [...defaultRows, ...customRows] });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { network, sizeLabel, sizeGB, validity, price, costPrice } = body;

  if (!network || !["mtn", "telecel", "airteltigo"].includes(network)) {
    return Response.json({ error: "Valid network required (MTN, Telecel, or AirtelTigo)." }, { status: 400 });
  }
  if (!sizeLabel?.trim()) return Response.json({ error: "Size label is required (e.g. 2GB)." }, { status: 400 });
  if (!sizeGB || isNaN(Number(sizeGB)) || Number(sizeGB) <= 0) {
    return Response.json({ error: "Valid GB size required." }, { status: 400 });
  }
  if (!validity?.trim()) return Response.json({ error: "Validity is required (e.g. 30 days)." }, { status: 400 });
  if (!price || isNaN(Number(price)) || Number(price) <= 0) {
    return Response.json({ error: "Valid selling price required." }, { status: 400 });
  }
  if (!costPrice || isNaN(Number(costPrice)) || Number(costPrice) <= 0) {
    return Response.json({ error: "Valid cost price required." }, { status: 400 });
  }
  if (Number(costPrice) >= Number(price)) {
    return Response.json({ error: "Cost price must be less than selling price." }, { status: 400 });
  }

  const bundleId = `custom-${network}-${Date.now()}`;

  const { error } = await supabase.from("bundle_prices").insert({
    id: bundleId,
    network,
    price: Number(price),
    cost_price: Number(costPrice),
    size_label: sizeLabel.trim(),
    size_gb: Number(sizeGB),
    validity: validity.trim(),
    active: true,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return Response.json({ error: `Failed to add bundle: ${error.message} (code: ${error.code})` }, { status: 500 });
  }

  return Response.json({ success: true, bundleId });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bundleId } = body;
  if (!bundleId) return Response.json({ error: "bundleId required." }, { status: 400 });

  const defaultBundle = defaultBundles.find((b) => b.id === bundleId);
  if (defaultBundle) {
    return Response.json({ error: "Default bundles cannot be deleted — toggle them inactive instead." }, { status: 400 });
  }

  const { error } = await supabase.from("bundle_prices").delete().eq("id", bundleId);
  if (error) return Response.json({ error: `Failed to delete: ${error.message}` }, { status: 500 });
  return Response.json({ success: true });
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

  // Allow default bundles OR custom bundles from DB
  const defaultBundle = defaultBundles.find((b) => b.id === bundleId);
  if (!defaultBundle) {
    // Check it's a valid custom bundle in the DB
    const { data: existing } = await supabase
      .from("bundle_prices").select("id").eq("id", bundleId).maybeSingle();
    if (!existing) {
      return Response.json({ error: "Invalid bundle ID." }, { status: 400 });
    }
  }

  // Toggle active only
  if (typeof active === "boolean" && price === undefined) {
    const { data: existing } = await supabase
      .from("bundle_prices").select("price, cost_price").eq("id", bundleId).maybeSingle();

    const fallbackPrice = existing?.price ?? defaultBundle?.price ?? 0;
    const fallbackCost = existing?.cost_price ?? defaultBundle?.costPrice ?? 0;

    const { error } = await supabase.from("bundle_prices").upsert({
      id: bundleId,
      price: fallbackPrice,
      cost_price: fallbackCost,
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

  let resolvedActive: boolean;
  if (typeof active === "boolean") {
    resolvedActive = active;
  } else {
    const { data: existing } = await supabase
      .from("bundle_prices").select("active").eq("id", bundleId).maybeSingle();
    resolvedActive = existing ? existing.active !== false : true;
  }

  const upsertData: Record<string, unknown> = {
    id: bundleId,
    price,
    cost_price: costPrice,
    active: resolvedActive,
    updated_at: new Date().toISOString(),
  };

  const hasMetadata = sizeLabel !== undefined || sizeGB !== undefined || validity !== undefined;

  if (hasMetadata) {
    if (sizeLabel !== undefined) upsertData.size_label = sizeLabel || null;
    if (sizeGB !== undefined) upsertData.size_gb = sizeGB;
    if (validity !== undefined) upsertData.validity = validity || null;

    const { error } = await supabase.from("bundle_prices").upsert(upsertData);
    if (error) {
      const { error: fallbackError } = await supabase.from("bundle_prices").upsert({
        id: bundleId, price, cost_price: costPrice, active: resolvedActive,
        updated_at: new Date().toISOString(),
      });
      if (fallbackError) return Response.json({ error: "Failed to update price." }, { status: 500 });
      return Response.json({ success: true, warning: "Prices saved. Run the Supabase SQL setup to enable size/validity editing." });
    }
    return Response.json({ success: true });
  }

  const { error } = await supabase.from("bundle_prices").upsert(upsertData);
  if (error) return Response.json({ error: "Failed to update price." }, { status: 500 });
  return Response.json({ success: true });
}
