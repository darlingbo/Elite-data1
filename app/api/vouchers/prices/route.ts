import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const DEFAULT_PRICES: Record<string, { sellPrice: number; bulkPrice: number; costPrice: number }> = {
  BECE:   { sellPrice: 19, bulkPrice: 18, costPrice: 15 },
  WASSCE: { sellPrice: 19, bulkPrice: 18, costPrice: 15 },
};

const BULK_THRESHOLD = 10; // qty > 10 gets bulk price

export async function GET(request: NextRequest) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";

  const [priceRes, codeRes] = await Promise.all([
    supabase.from("system_settings").select("value").eq("key", "voucher_prices").maybeSingle(),
    code
      ? supabase.from("system_settings").select("value").eq("key", "voucher_discount_code").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stored = priceRes.data?.value
    ? (JSON.parse(priceRes.data.value) as Record<string, { sellPrice: number; costPrice: number }>)
    : null;

  const validCode = ((codeRes.data as { value?: string } | null)?.value ?? "").trim();
  const promoApplied = !!(code && validCode && code === validCode);

  const result: Record<string, { sellPrice: number; bulkPrice: number; bulkThreshold: number; promoApplied: boolean }> = {};
  for (const key of ["BECE", "WASSCE"] as const) {
    const def = DEFAULT_PRICES[key];
    result[key] = {
      sellPrice: stored?.[key]?.sellPrice ?? def.sellPrice,
      bulkPrice: def.bulkPrice,
      bulkThreshold: BULK_THRESHOLD,
      promoApplied,
    };
  }
  return Response.json(result);
}
