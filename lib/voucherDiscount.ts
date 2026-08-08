import "server-only";
import { supabase } from "@/lib/supabase";

export async function getVoucherDiscountStatus(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return { valid: false, remaining: 0 };

  const [codeResult, maxResult, usedResult] = await Promise.all([
    supabase.from("system_settings").select("value").eq("key", "voucher_discount_code").maybeSingle(),
    supabase.from("system_settings").select("value").eq("key", "voucher_discount_max_uses").maybeSingle(),
    supabase.from("voucher_discount_redemptions").select("*", { count: "exact", head: true }).eq("discount_code", normalizedCode),
  ]);

  const configuredCode = (codeResult.data?.value ?? "").trim().toUpperCase();
  const maxUses = Math.max(0, Number(maxResult.data?.value ?? 0) || 0);
  const used = usedResult.count ?? 0;
  const remaining = Math.max(0, maxUses - used);

  return {
    valid: configuredCode === normalizedCode && remaining > 0,
    remaining,
  };
}

export async function claimVoucherDiscount(code: string, paymentReference: string) {
  const { data, error } = await supabase.rpc("claim_voucher_discount", {
    p_code: code.trim(),
    p_payment_reference: paymentReference.trim(),
  });
  if (error) throw error;
  return data === true;
}
