import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("mashup_bundles")
    .select("id, name, data_value, data_unit, minutes, price, cost_price")
    .eq("active", true)
    .order("price", { ascending: true });

  if (error) return Response.json({ bundles: [] });
  return Response.json({ bundles: data ?? [] });
}
