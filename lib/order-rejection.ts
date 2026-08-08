import { supabase } from "@/lib/supabase";
import { auditLog } from "@/lib/audit";
import { sendAgentNotification } from "@/lib/telegram";
import { getOrderReviewSecondsRemaining, orderReviewWaitMessage } from "@/lib/order-review-window";

export type RejectionChannel = "admin_dashboard" | "telegram" | "sms";

export async function rejectOrder(
  reference: string,
  channel: RejectionChannel = "admin_dashboard",
): Promise<{ ok: boolean; message: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select("phone, network, bundle_size, amount, status, agent_id, created_at")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return { ok: false, message: "Order not found" };
  if (order.status !== "pending_approval") {
    return { ok: false, message: `Already ${order.status}` };
  }
  const reviewSeconds = getOrderReviewSecondsRemaining(order.created_at);
  if (reviewSeconds > 0) return { ok: false, message: orderReviewWaitMessage(reviewSeconds) };

  const { data: walletResult, error: walletRefundError } = await supabase.rpc(
    "reject_reserved_wallet_order",
    { p_reference: reference },
  );
  if (walletRefundError) return { ok: false, message: `Wallet refund failed: ${walletRefundError.message}` };

  if (walletResult === "not_wallet") {
    const { error } = await supabase
      .from("orders")
      .update({ status: "rejected" })
      .eq("reference", reference)
      .eq("status", "pending_approval");
    if (error) return { ok: false, message: error.message };
  }

  await auditLog("order_rejected", { reference, channel });

  if (walletResult === "agent_wallet_refunded" && order.agent_id) {
    const { data: agent } = await supabase
      .from("agents")
      .select("telegram_chat_id")
      .eq("id", order.agent_id)
      .maybeSingle();
    if (agent?.telegram_chat_id) {
      sendAgentNotification(
        agent.telegram_chat_id,
        `Order rejected\n${order.network?.toUpperCase()} ${order.bundle_size} -> ${order.phone}\n` +
        `GH₵${Number(order.amount).toFixed(2)} refunded\nRef: ${reference}`,
      ).catch(() => {});
    }
  }

  return {
    ok: true,
    message: walletResult === "api_wallet_refunded"
      ? "Rejected; API wallet refunded"
      : walletResult === "agent_wallet_refunded"
        ? "Rejected; agent wallet refunded"
        : "Rejected",
  };
}
