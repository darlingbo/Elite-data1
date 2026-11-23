import { sendAdminAlert, tgEscape } from "@/lib/telegram";

/**
 * An order the admin already refunded by hand (status "refunded") can still be
 * reported as delivered by the supplier afterwards — refunds are allowed while
 * an order is processing. The order stays "refunded" (never flipped back to
 * completed or failed, which could trigger a second refund); the admin gets a
 * Telegram alert so they can recover the money from the customer.
 */
export async function alertDeliveredAfterRefund(
  order: { reference: string; phone?: string | null; network?: string | null; bundle_size?: string | null; amount?: number | null },
  supplier: string,
): Promise<void> {
  const amount = Number(order.amount ?? 0);
  await sendAdminAlert(
    [
      "⚠️ Delivered AFTER refund",
      "",
      `${tgEscape(supplier)} says this order was delivered, but it was already refunded:`,
      `📱 ${tgEscape(`${(order.network ?? "").toUpperCase()} ${order.bundle_size ?? ""}`.trim())} → ${tgEscape(order.phone ?? "—")}`,
      `💰 GH₵${amount.toFixed(2)}`,
      `Ref: ${tgEscape(order.reference)}`,
      "",
      "The customer may have the data and the refund. The order stays marked Refunded.",
    ].join("\n"),
  );
}
