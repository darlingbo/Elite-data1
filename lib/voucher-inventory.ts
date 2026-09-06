import { supabase } from "@/lib/supabase";
import { sendCustomerSMS, sendVoucherSMS } from "@/lib/sms";
import { sendAdminAlert, tgEscape } from "@/lib/telegram";

type VoucherRow = { id: number; code: string };

export function parseVoucherOrder(bundleSize: string | null | undefined): { type: "BECE" | "WASSCE"; quantity: number } {
  const value = String(bundleSize ?? "");
  const type = /^WASSCE/i.test(value) ? "WASSCE" : "BECE";
  const match = value.match(/x(\d+)/i);
  return { type, quantity: match ? Math.max(1, Number.parseInt(match[1], 10)) : 1 };
}

export async function deliverVoucherFromInventory(order: {
  reference: string;
  phone: string;
  customer_name?: string | null;
  bundle_size?: string | null;
}): Promise<{ ok: boolean; message: string; fallbackToInventor: boolean }> {
  const { type, quantity } = parseVoucherOrder(order.bundle_size);
  const { data, error } = await supabase.rpc("assign_vouchers_to_order", {
    p_order_reference: order.reference,
    p_voucher_type: type,
    p_quantity: quantity,
  });
  if (error) {
    return {
      ok: false,
      message: error.message,
      fallbackToInventor: /not enough (BECE|WASSCE) vouchers in stock/i.test(error.message),
    };
  }

  const vouchers = (data ?? []) as VoucherRow[];
  if (vouchers.length !== quantity) {
    return { ok: false, message: "Voucher stock allocation returned the wrong quantity", fallbackToInventor: false };
  }

  const firstName = String(order.customer_name ?? "Customer").trim().split(/\s+/)[0] || "Customer";
  const codes = vouchers.map((voucher, index) => `${index + 1}. ${voucher.code}`).join("\n");
  const shortReference = order.reference.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
  const { data: assisted } = await supabase.from("result_checker_requests").select("exam_type,candidate_type,candidate_name,index_number,exam_year,date_of_birth,whatsapp").eq("order_reference", order.reference).maybeSingle();
  if (assisted) {
    try {
      await sendAdminAlert(`📋 <b>RESULT CHECKER REQUEST — READY</b>\n\nExam: <b>${tgEscape(assisted.exam_type)} ${tgEscape(assisted.candidate_type.toUpperCase())}</b>\nCandidate: ${tgEscape(assisted.candidate_name)}\nIndex: <code>${tgEscape(assisted.index_number)}</code>\nYear: <b>${assisted.exam_year}</b>${assisted.date_of_birth ? `\nDate of birth: <code>${tgEscape(assisted.date_of_birth)}</code>` : ""}\nWhatsApp: <code>${tgEscape(assisted.whatsapp)}</code>\nVoucher: <code>${tgEscape(codes)}</code>\nOrder: <code>${tgEscape(order.reference)}</code>\n\nCheck the result manually and send it to the customer on WhatsApp.`);
    } catch {
      return { ok: false, message: "Voucher reserved, but the admin Telegram notification failed", fallbackToInventor: false };
    }
    await Promise.all([
      supabase.from("result_checker_requests").update({ status: "awaiting_result" }).eq("order_reference", order.reference),
      supabase.from("voucher_inventory").update({ status: "sent", sent_at: new Date().toISOString() }).in("id", vouchers.map(voucher => voucher.id)).eq("order_reference", order.reference),
      sendCustomerSMS(order.phone, `Hi ${firstName}, your ${assisted.exam_type} result check (Ref ${shortReference}) is being processed. The result goes to your WhatsApp. - Elite Data`),
    ]);
    return { ok: true, message: `${assisted.exam_type} voucher and candidate details sent securely to admin for manual result checking`, fallbackToInventor: false };
  }
  const sms = await sendVoucherSMS(
    order.phone,
    `${type} voucher${quantity > 1 ? "s" : ""} (Ref ${shortReference}):\n${codes}\nKeep this SMS safe. - Elite Data`,
    order.reference,
  );
  if (!sms.ok) {
    return { ok: false, message: `Vouchers reserved, but SMS failed: ${sms.message}`, fallbackToInventor: false };
  }

  const ids = vouchers.map((voucher) => voucher.id);
  const { error: sentError } = await supabase
    .from("voucher_inventory")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .in("id", ids)
    .eq("order_reference", order.reference);
  if (sentError) {
    return { ok: false, message: `SMS sent, but stock status update failed: ${sentError.message}`, fallbackToInventor: false };
  }
  return { ok: true, message: `${quantity} ${type} voucher${quantity > 1 ? "s" : ""} sent by SMS`, fallbackToInventor: false };
}
