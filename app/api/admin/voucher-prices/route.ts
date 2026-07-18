import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

const DEFAULT_PRICES = {
  BECE:   { sellPrice: 19, costPrice: 15 },
  WASSCE: { sellPrice: 19, costPrice: 15 },
};

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "voucher_prices")
    .maybeSingle();

  const prices = data?.value ? JSON.parse(data.value) : DEFAULT_PRICES;
  return Response.json(prices);
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });

  const { type, sellPrice, costPrice } = body as { type: string; sellPrice: number; costPrice: number };

  if (!["BECE", "WASSCE"].includes(type)) {
    return Response.json({ error: "type must be BECE or WASSCE" }, { status: 400 });
  }
  if (typeof sellPrice !== "number" || sellPrice <= 0) {
    return Response.json({ error: "sellPrice must be a positive number" }, { status: 400 });
  }
  if (typeof costPrice !== "number" || costPrice <= 0) {
    return Response.json({ error: "costPrice must be a positive number" }, { status: 400 });
  }
  if (costPrice >= sellPrice) {
    return Response.json({ error: "costPrice must be less than sellPrice" }, { status: 400 });
  }

  // Load existing, merge in change
  const { data: existing } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "voucher_prices")
    .maybeSingle();

  const current = existing?.value ? JSON.parse(existing.value) : { ...DEFAULT_PRICES };
  current[type] = { sellPrice, costPrice };

  await supabase.from("system_settings").upsert(
    { key: "voucher_prices", value: JSON.stringify(current), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  return Response.json({ success: true, prices: current });
}
