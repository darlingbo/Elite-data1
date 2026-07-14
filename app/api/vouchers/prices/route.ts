import { supabase } from "@/lib/supabase";

const DEFAULT_PRICES = {
  BECE:   { sellPrice: 18 },
  WASSCE: { sellPrice: 18 },
};

export async function GET() {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "voucher_prices")
    .maybeSingle();

  if (!data?.value) return Response.json(DEFAULT_PRICES);

  const full = JSON.parse(data.value) as Record<string, { sellPrice: number; costPrice: number }>;
  // Only expose sell prices to the public
  const pub: Record<string, { sellPrice: number }> = {};
  for (const [k, v] of Object.entries(full)) pub[k] = { sellPrice: v.sellPrice };
  return Response.json(pub);
}
