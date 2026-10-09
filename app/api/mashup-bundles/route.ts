import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("mashup_bundles")
    .select("id, name, data_value, data_unit, minutes, price, cost_price")
    .eq("active", true)
    .order("price", { ascending: true });

  if (error) {
    console.error("[mashup-bundles] Supabase query error:", error.message, error.code);
    return Response.json({ bundles: [] });
  }
  return Response.json({ bundles: data ?? [] });
}
