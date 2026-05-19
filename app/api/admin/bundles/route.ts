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

  const { data: overrides } = await supabase
    .from("bundle_prices")
    .select("id, price, cost_price, active");

  const overrideMap = new Map(
    (overrides ?? []).map((o: { id: string; price: number; cost_price: number; active: boolean }) => [o.id, o])
  );

  const bundles = defaultBundles.map((b) => {
    const ov = overrideMap.get(b.id);
    return {
      id: b.id,
      network: b.network,
      size: b.size,
      sizeGB: b.sizeGB,
      validity: b.validity,
      price: ov ? ov.price : b.price,
      costPrice: ov ? ov.cost_price : b.costPrice,
      hasOverride: !!ov,
    };
  });

  return Response.json({ bundles });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bundleId, price, costPrice } = await request.json();

  if (!bundleId || typeof price !== "number" || typeof costPrice !== "number") {
    return Response.json({ error: "bundleId, price, and costPrice are required." }, { status: 400 });
  }
  if (price <= 0 || costPrice <= 0) {
    return Response.json({ error: "Prices must be greater than 0." }, { status: 400 });
  }
  if (costPrice >= price) {
    return Response.json({ error: "Cost price must be less than selling price." }, { status: 400 });
  }

  const valid = defaultBundles.find((b) => b.id === bundleId);
  if (!valid) {
    return Response.json({ error: "Invalid bundle ID." }, { status: 400 });
  }

  const { error } = await supabase.from("bundle_prices").upsert({
    id: bundleId,
    price,
    cost_price: costPrice,
    active: true,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return Response.json({ error: "Failed to update price." }, { status: 500 });
  }

  return Response.json({ success: true });
}
