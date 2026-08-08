import { supabase } from "@/lib/supabase";
import { networkApiName } from "@/lib/bundles";
import { sendAgentNotification, sendAdminAlert } from "@/lib/telegram";
import { inventorPurchase, inventorVoucher } from "@/lib/inventor";
import { sendCustomerSMS, orderFailedSMS } from "@/lib/sms";
import { auditLog } from "@/lib/audit";
import { assessOrderRisk, isOrderGuardEnabled } from "@/lib/order-risk";
import { deliverVoucherFromInventory } from "@/lib/voucher-inventory";

export type ApprovalChannel = "admin_dashboard" | "telegram" | "auto_approval" | "sms";

async function creditMasterCommission(reference: string): Promise<void> {
  const { error } = await supabase.rpc("credit_master_agent_commission", { p_reference: reference });
  if (error) await auditLog("master_commission_credit_failed", { reference, error: error.message });
}

export async function isAutoApprovalEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "auto_approve_orders")
    .maybeSingle();
  return !error && data?.value === "1";
}

export async function approveOrder(
  reference: string,
  channel: ApprovalChannel = "admin_dashboard",
): Promise<{ ok: boolean; message: string }> {
  const { data: claimResult, error: claimError } = await supabase.rpc(
    "claim_order_for_fulfillment",
    { p_reference: reference, p_channel: channel },
  );
  if (claimError) {
    await auditLog("order_approval_claim_failed", { reference, channel, error: claimError.message });
    return { ok: false, message: `Approval safety check failed: ${claimError.message}` };
  }

  const claim = String(claimResult ?? "");
  if (claim.startsWith("duplicate_blocked:")) {
    const originalReference = claim.slice("duplicate_blocked:".length);
    await auditLog("duplicate_order_blocked", {
      reference,
      original_reference: originalReference,
      channel,
      refund: false,
    });
    sendAdminAlert(
      `🚫 <b>DUPLICATE ORDER BLOCKED — NO REFUND</b>\n` +
      `Second ref: <code>${reference}</code>\n` +
      `First ref: <code>${originalReference}</code>\n\n` +
      `The second order was not sent to Inventor and was not refunded.`,
    ).catch(() => {});
    return { ok: false, message: `Duplicate blocked; not sent and not refunded (first order: ${originalReference})` };
  }
  if (claim !== "claimed") {
    return {
      ok: false,
      message: claim === "not_found"
        ? "Order not found"
        : claim.startsWith("already_")
          ? `Already ${claim.slice("already_".length)}`
          : "Order could not be claimed for approval",
    };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("reference", reference)
    .eq("status", "processing")
    .maybeSingle();
  if (!order) return { ok: false, message: "Claimed order could not be loaded" };

  const isVoucher = order.network === "voucher";
  const { data: mashupBundleList } = await supabase
    .from("mashup_bundles")
    .select("id, data_value, data_unit, minutes")
    .eq("active", true);
  const isMashupOrder = !isVoucher && (mashupBundleList ?? []).some((bundle) => {
    const label = bundle.minutes > 0
      ? `${bundle.data_value}${bundle.data_unit} + ${bundle.minutes}min`
      : `${bundle.data_value}${bundle.data_unit}`;
    return label === order.bundle_size;
  });

  // Mashup orders require a person to deliver them. Never silently auto-approve
  // them because that would leave a processing order with no provider call.
  if (isMashupOrder && channel === "auto_approval") {
    await supabase
      .from("orders")
      .update({ status: "pending_approval", approved_at: null, approved_via: null, fulfillment_started_at: null })
      .eq("reference", reference)
      .eq("status", "processing");
    return { ok: false, message: "Manual approval required for Mashup" };
  }

  if (isMashupOrder) {
    await supabase.rpc("apply_agent_order_accounting", { p_reference: reference });
    await creditMasterCommission(reference);
    await auditLog("order_approved_manual_fulfillment", { reference, bundle: order.bundle_size, channel });
    return { ok: true, message: `Mashup approved — deliver ${order.bundle_size} to ${order.phone} manually, then force-complete` };
  }

  if (isVoucher) {
    const delivery = await deliverVoucherFromInventory(order);
    if (!delivery.ok && !delivery.fallbackToInventor) {
      await supabase
        .from("orders")
        .update({
          status: "pending_approval",
          approved_at: null,
          approved_via: null,
          fulfillment_started_at: null,
          provider_used: "voucher_inventory",
        })
        .eq("reference", reference)
        .eq("status", "processing");
      await auditLog("voucher_delivery_failed", { reference, channel, error: delivery.message });
      return { ok: false, message: delivery.message };
    }

    if (delivery.ok) {
      await supabase
        .from("orders")
        .update({ status: "completed", provider_used: "voucher_inventory", completed_at: new Date().toISOString() })
        .eq("reference", reference);
      await supabase.rpc("apply_agent_order_accounting", { p_reference: reference });
      await creditMasterCommission(reference);
      await auditLog("order_approved", { reference, provider: "voucher_inventory", channel });
      return { ok: true, message: delivery.message };
    }

    // No complete local allocation was made. Continue to the existing
    // Inventor voucher flow below for the entire order.
    await auditLog("voucher_inventory_fallback", { reference, channel, reason: delivery.message });
  }

  let apiOk = false;
  let balanceAfter: number | null = null;
  let errorBody: Record<string, unknown> = {};
  try {
    if (isVoucher) {
      const voucherTypeMatch = String(order.bundle_size ?? "").match(/^(BECE|WASSCE)/i);
      const qtyMatch = String(order.bundle_size ?? "").match(/x(\d+)/i);
      const voucherType = voucherTypeMatch ? voucherTypeMatch[1].toUpperCase() : "BECE";
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
      const recipient = order.phone.startsWith("0") ? `233${order.phone.slice(1)}` : order.phone;
      const result = await inventorVoucher(voucherType, recipient, qty);
      apiOk = result.ok;
      if (!apiOk) errorBody = result.body;
    } else {
      const networkApiMap: Record<string, string> = { mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE" };
      const network = networkApiMap[order.network as string] ??
        networkApiName[order.network as keyof typeof networkApiName] ?? "MTN";
      const result = await inventorPurchase(network, order.phone, Number(order.bundle_size_gb ?? 1), reference);
      apiOk = result.ok;
      balanceAfter = result.balance;
      if (!apiOk) errorBody = result.body;
    }
  } catch (error) {
    await supabase.from("orders").update({ status: "failed", provider_used: "inventor" }).eq("reference", reference);
    const message = error instanceof Error ? error.message : String(error);
    sendAdminAlert(`❌ Inventor exception on ${channel} approval of <code>${reference}</code>: ${message.slice(0, 120)}`).catch(() => {});
    return { ok: false, message: `Inventor error: ${message.slice(0, 120)}` };
  }

  if (!apiOk) {
    await supabase.from("orders").update({ status: "failed", provider_used: "inventor" }).eq("reference", reference);
    sendCustomerSMS(
      order.phone,
      orderFailedSMS(order.customer_name ?? "Customer", order.network ?? "", order.bundle_size ?? "", reference),
    ).catch(() => {});
    const message = String(
      (errorBody.error as string) ?? (errorBody.message as string) ?? JSON.stringify(errorBody),
    ).slice(0, 160);
    await auditLog("order_approval_failed", { reference, provider: "inventor", error: message, channel });
    return { ok: false, message };
  }

  const fulfillmentUpdate = isVoucher
    ? { status: "completed", provider_used: "inventor", completed_at: new Date().toISOString() }
    : { status: "processing", provider_used: "inventor" };
  await supabase.from("orders").update(fulfillmentUpdate).eq("reference", reference);
  await supabase.rpc("apply_agent_order_accounting", { p_reference: reference });
  await creditMasterCommission(reference);

  if (!isVoucher) try {
    const { inventorBalance } = await import("@/lib/inventor");
    const balance = balanceAfter ?? await inventorBalance();
    if (balance !== null && balance < Number(process.env.INVENTOR_LOW_BALANCE_GHS ?? 50)) {
      sendAdminAlert(`⚠️ <b>Inventor balance low: GH₵${balance.toFixed(2)}</b> — top up now to avoid delivery failures.`).catch(() => {});
    }
  } catch {
    // Balance alerts never block delivery.
  }

  if (reference.startsWith("AGTWALLET-") && order.agent_id) {
    const { data: agent } = await supabase
      .from("agents").select("telegram_chat_id").eq("id", order.agent_id).maybeSingle();
    if (agent?.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `✅ <b>Delivered!</b>\n\n📱 ${order.network?.toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>\n📎 <code>${reference}</code>`,
      ).catch(() => {});
    }
  }

  await auditLog("order_approved", { reference, provider: "inventor", channel });
  if (channel === "auto_approval") {
    sendAdminAlert(`⚡ <b>AUTO-APPROVED</b>\n<code>${reference}</code>\n${order.network?.toUpperCase()} ${order.bundle_size} → <code>${order.phone}</code>`).catch(() => {});
  }
  return {
    ok: true,
    message: isVoucher
      ? (channel === "auto_approval" ? "Auto-approved & delivered" : "Approved & delivered")
      : (channel === "auto_approval" ? "Auto-approved & sent" : "Approved & sent"),
  };
}

export async function maybeAutoApprove(reference: string): Promise<{ attempted: boolean; ok: boolean; message: string }> {
  if (!(await isAutoApprovalEnabled())) return { attempted: false, ok: false, message: "Auto-approval disabled" };

  if (await isOrderGuardEnabled()) {
    const risk = await assessOrderRisk(reference);
    if (!risk.allow) {
      return { attempted: true, ok: false, message: `Held by AI Order Guard: ${risk.reasons.join("; ")}` };
    }
  }
  const result = await approveOrder(reference, "auto_approval");
  return { attempted: true, ...result };
}
