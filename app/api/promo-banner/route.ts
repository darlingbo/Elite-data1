import { supabase } from "@/lib/supabase";
import { publicCache } from "@/lib/public-cache";

export async function GET() {
  const { data } = await supabase
    .from("admin_config")
    .select("value")
    .eq("key", "promo_banner")
    .maybeSingle();

  const headers = publicCache(60);
  if (!data?.value) {
    return Response.json({ enabled: false, message: "", submessage: "", theme: "blue" }, { headers });
  }
  try {
    return Response.json(JSON.parse(data.value), { headers });
  } catch {
    return Response.json({ enabled: false, message: "", submessage: "", theme: "blue" }, { headers });
  }
}
