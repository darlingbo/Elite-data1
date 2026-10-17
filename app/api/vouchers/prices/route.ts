import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getVoucherDiscountStatus } from "@/lib/voucherDiscount";

const DEFAULT_PRICES: Record<string, { sellPrice: number; bulkPrice: number; costPrice: number }> = {
  BECE:   { sellPrice: 19, bulkPrice: 18, costPrice: 15 },
  WASSCE: { sellPrice: 19, bulkPrice: 18, costPrice: 15 },
};

const BULK_THRESHOLD = 10; // qty > 10 gets bulk price

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";

  const [priceRes, discountStatus] = await Promise.all([
    supabase.from("system_settings").select("value").eq("key", "voucher_prices").maybeSingle(),
    getVoucherDiscountStatus(code),
  ]);

  let stored: Record<string, { sellPrice: number; costPrice: number }> | null = null;
  try {
    stored = priceRes.data?.value
      ? JSON.parse(priceRes.data.value) as Record<string, { sellPrice: number; costPrice: number }>
      : null;
  } catch {
    console.error("[vouchers/prices] Invalid voucher_prices setting; using safe defaults");
  }

  const promoApplied = discountStatus.valid;

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
