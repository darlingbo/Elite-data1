import { supabase } from "@/lib/supabase";

// Public endpoint — no auth required
// Returns which networks are enabled so the buy page can hide disabled ones
export async function GET() {
  async function get(key: string, def = "1") {
    const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
    return data?.value ?? def;
  }

  const [mtn, telecel, at, mashup, slowDelivery] = await Promise.all([
    get("network_mtn_active"),
    get("network_telecel_active"),
    get("network_at_active"),
    get("network_mashup_active"),
    get("slow_delivery", "0"),
  ]);

  return Response.json({ mtn: mtn === "1", telecel: telecel === "1", at: at === "1", mashup: mashup === "1", slowDelivery: slowDelivery === "1" });
}
