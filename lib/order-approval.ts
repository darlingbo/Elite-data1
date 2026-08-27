import { supabase } from "@/lib/supabase";
import { networkApiName } from "@/lib/bundles";
import { sendAgentNotification, sendAdminAlert, sendOrderFailedAlert } from "@/lib/telegram";
import { inventorPurchase, inventorVerifyNumber, inventorVoucher } from "@/lib/inventor";
import { sendCustomerSMS, orderFailedSMS, isNotOnListError, orderNotOnListSMS } from "@/lib/sms";
import { auditLog } from "@/lib/audit";
import { assessOrderRisk, isOrderGuardEnabled } from "@/lib/order-risk";
import { deliverVoucherFromInventory } from "@/lib/voucher-inventory";
import { getOrderReviewSecondsRemaining, orderReviewWaitMessage } from "@/lib/order-review-window";

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
  const { data: reviewOrder } = await supabase
    .from("orders")
    .select("created_at, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!reviewOrder) return { ok: false, message: "Order not found" };
  if (reviewOrder.status !== "pending_approval") return { ok: false, message: `Already ${reviewOrder.status}` };
  // The review window is for human approval/rejection actions. Automatic
  // approval is invoked once, immediately after an order is created; applying
  // the window here would reject that only attempt with no later retry.
  if (channel !== "auto_approval") {
    const reviewSeconds = getOrderReviewSecondsRemaining(reviewOrder.created_at);
    if (reviewSeconds > 0) return { ok: false, message: orderReviewWaitMessage(reviewSeconds) };
  }

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

  if (isMashupOrder) {
    await supabase.rpc("apply_agent_order_accounting", { p_reference: reference });
    await creditMasterCommission(reference);
    await auditLog("order_approved_manual_fulfillment", { reference, bundle: order.bundle_size, channel });
    if (channel === "auto_approval") {
      sendAdminAlert(
        `⚡ <b>AUTO-APPROVED — MANUAL MASHUP DELIVERY</b>\n<code>${reference}</code>\n${order.bundle_size} → <code>${order.phone}</code>`,
      ).catch(() => {});
    }
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
  let inventorReference: string | null = null;
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
      if (network === "MTN") {
        const verification = await inventorVerifyNumber(order.phone);
        if (!verification.verified) {
          // New number / not on the beneficiary list: this is a delivery DELAY,
          // not a failure. Hold it for manual delivery (up to 72h), tell the
          // customer no refund is coming, and keep it out of the approval queue.
          await supabase
            .from("orders")
            .update({ status: "not_on_list", not_on_list_at: new Date().toISOString() })
            .eq("reference", reference)
            .eq("status", "processing");
          const reason = verification.error ?? "MTN number is not on the Inventor beneficiary list";
          await auditLog("order_not_on_list", { reference, channel, reason, stage: "pre_purchase" });
          sendCustomerSMS(
            order.phone,
            orderNotOnListSMS(order.customer_name ?? "Customer", order.network ?? "", order.bundle_size ?? "", reference),
          ).catch(() => {});
          sendAdminAlert(
            `🟠 <b>NEW NUMBER — MANUAL DELIVERY (up to 72h)</b>\n<code>${reference}</code>\n<code>${order.phone}</code>\n${reason}\n\nDeliver via the Inventor dashboard, then mark the order complete.`,
          ).catch(() => {});
          return { ok: false, message: reason };
        }
      }
      const result = await inventorPurchase(network, order.phone, Number(order.bundle_size_gb ?? 1), reference);
      apiOk = result.ok;
      balanceAfter = result.balance;
      inventorReference = result.reference;
      if (!apiOk) errorBody = result.body;
    }
  } catch (error) {
    await supabase.from("orders").update({ status: "failed", provider_used: "inventor" }).eq("reference", reference);
    const message = error instanceof Error ? error.message : String(error);
    sendOrderFailedAlert({
      reference,
      phone: order.phone,
      network: order.network,
      bundleSize: order.bundle_size,
      reason: `Inventor exception: ${message.slice(0, 160)}`,
    }).catch(() => {});
    return { ok: false, message: `Inventor error: ${message.slice(0, 120)}` };
  }

  if (!apiOk) {
    const message = String(
      (errorBody.message as string) ?? (errorBody.error as string) ?? JSON.stringify(errorBody),
    ).slice(0, 160);

    // A "not on beneficiary list / new number" rejection is a delay, not a
    // failure — hold for manual delivery (up to 72h), no refund.
    if (!isVoucher && isNotOnListError(message)) {
      await supabase
        .from("orders")
        .update({ status: "not_on_list", not_on_list_at: new Date().toISOString(), provider_used: "inventor" })
        .eq("reference", reference);
      sendCustomerSMS(
        order.phone,
        orderNotOnListSMS(order.customer_name ?? "Customer", order.network ?? "", order.bundle_size ?? "", reference),
      ).catch(() => {});
      sendAdminAlert(
        `🟠 <b>NEW NUMBER — MANUAL DELIVERY (up to 72h)</b>\n<code>${reference}</code>\n<code>${order.phone}</code>\n${message}\n\nDeliver via the Inventor dashboard, then mark the order complete.`,
      ).catch(() => {});
      await auditLog("order_not_on_list", { reference, channel, reason: message, stage: "purchase" });
      return { ok: false, message };
    }

    await supabase.from("orders").update({ status: "failed", provider_used: "inventor" }).eq("reference", reference);
    sendCustomerSMS(
      order.phone,
      orderFailedSMS(order.customer_name ?? "Customer", order.network ?? "", order.bundle_size ?? "", reference),
    ).catch(() => {});
    sendOrderFailedAlert({
      reference,
      phone: order.phone,
      network: order.network,
      bundleSize: order.bundle_size,
      reason: message,
    }).catch(() => {});
    await auditLog("order_approval_failed", { reference, provider: "inventor", error: message, channel });
    return { ok: false, message };
  }

  const fulfillmentUpdate = isVoucher
    ? { status: "completed", provider_used: "inventor", completed_at: new Date().toISOString() }
    : { status: "processing", provider_used: "inventor", inventor_order_id: inventorReference ?? reference };
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
    // Only a genuinely unpaid / invalid order is ever held. Softer flags do not
    // block automatic approval — they alert the admin and the order still goes.
    if (risk.mustHold) {
      return { attempted: true, ok: false, message: `Held by AI Order Guard: ${risk.reasons.join("; ")}` };
    }
    if (!risk.allow) {
      sendAdminAlert(
        `⚠️ <b>AUTO-APPROVED WITH GUARD FLAGS</b>\n<code>${reference}</code>\n${risk.reasons.join("; ")}\n\nData is being delivered now. Reverse it manually if this looks wrong.`,
      ).catch(() => {});
    }
  }
  const result = await approveOrder(reference, "auto_approval");
  if (!result.ok && !/^Already /.test(result.message)) {
    sendAdminAlert(
      `⚠️ <b>AUTO-APPROVAL DID NOT COMPLETE</b>\n<code>${reference}</code>\n${result.message}\n\nApprove it manually from the dashboard.`,
    ).catch(() => {});
  }
  return { attempted: true, ...result };
}

export async function processAutoApprovalQueue(): Promise<{
  found: number;
  approved: number;
  held: number;
}> {
  if (!(await isAutoApprovalEnabled())) return { found: 0, approved: 0, held: 0 };

  const references: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("reference")
      .eq("status", "pending_approval")
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load the automatic approval queue: ${error.message}`);
    references.push(...(orders ?? []).map((order) => String(order.reference)).filter(Boolean));
    if ((orders ?? []).length < pageSize) break;
  }
  let approved = 0;
  let nextIndex = 0;

  // Keep provider traffic controlled while still draining a large queue in a
  // reasonable time. The database claim function protects concurrent attempts.
  async function worker() {
    while (nextIndex < references.length) {
      const reference = references[nextIndex++];
      const result = await maybeAutoApprove(reference);
      if (result.ok) approved += 1;
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, references.length) }, () => worker()));
  return { found: references.length, approved, held: references.length - approved };
}
