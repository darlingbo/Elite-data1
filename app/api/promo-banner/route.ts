import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data } = await supabase
    .from("admin_config")
    .select("value")
    .eq("key", "promo_banner")
    .maybeSingle();

  if (!data?.value) {
    return Response.json({ enabled: false, message: "", submessage: "", theme: "blue" });
  }
  try {
    return Response.json(JSON.parse(data.value));
  } catch {
    return Response.json({ enabled: false, message: "", submessage: "", theme: "blue" });
  }
}
