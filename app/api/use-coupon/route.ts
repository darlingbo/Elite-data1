import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return Response.json({ error: "Missing coupon id" }, { status: 400 });
  await supabase.rpc("increment_coupon_usage", { coupon_id: id }).catch(() =>
    supabase.from("promo_codes").update({ used_count: supabase.rpc("used_count") }).eq("id", id)
  );
  // Simple increment via raw SQL
  await supabase.from("promo_codes").select("used_count").eq("id", id).single().then(({ data }) => {
    if (data) supabase.from("promo_codes").update({ used_count: (data.used_count ?? 0) + 1 }).eq("id", id);
  });
  return Response.json({ success: true });
}
