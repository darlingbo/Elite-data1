import { supabase } from "@/lib/supabase";

// Public read — agents need tier prices to know their minimum base
export async function GET() {
  const { data } = await supabase
    .from("custom_tier_prices")
    .select("bundle_id, price");
  return Response.json({ prices: data ?? [] });
}
