import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { code, amount } = await req.json() as { code: string; amount: number };
  if (!code?.trim()) return Response.json({ error: "No code entered" }, { status: 400 });

  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return Response.json({ error: "Invalid promo code" }, { status: 404 });

  if (data.expires_at && new Date(data.expires_at) < new Date())
    return Response.json({ error: "This promo code has expired" }, { status: 400 });

  if (data.max_uses !== null && data.used_count >= data.max_uses)
    return Response.json({ error: "This promo code has reached its usage limit" }, { status: 400 });

  const discount =
    data.discount_type === "percent"
      ? parseFloat(((amount * data.discount_value) / 100).toFixed(2))
      : Math.min(parseFloat(data.discount_value), amount);

  return Response.json({
    valid: true,
    code: data.code,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    discount,
    id: data.id,
  });
}
