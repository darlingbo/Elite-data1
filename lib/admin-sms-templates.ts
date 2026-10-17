// Ready-made customer messages for the admin order screens.
// Pure functions: the browser uses them for the preview, the server for the text it sends.

export const REJECT_REASONS = [
  { id: "wrong_number", label: "Wrong number", because: "the number could not receive data" },
  { id: "network_down", label: "Network down", because: "the network is down" },
  { id: "possible_fraud", label: "Possible fraud", because: "we could not verify the payment" },
  { id: "duplicate", label: "Duplicate", because: "it was a duplicate order" },
  { id: "other", label: "Other", because: "we could not complete it" },
] as const;

export type RejectReasonId = (typeof REJECT_REASONS)[number]["id"];

export function isRejectReason(value: unknown): value is RejectReasonId {
  return REJECT_REASONS.some((r) => r.id === value);
}

/** The reference as the customer sees it (for example YBK-482131). Long ones keep the last 8 characters. */
export function shortRef(reference: string): string {
  const ref = reference.trim();
  return ref.length <= 14 ? ref : ref.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase();
}

export function rejectionSms(opts: { reference: string; reason: RejectReasonId; amount: number; willRefund: boolean }): string {
  const because = REJECT_REASONS.find((r) => r.id === opts.reason)?.because ?? "we could not complete it";
  const tail = opts.willRefund
    ? `Your GH₵${opts.amount.toFixed(2)} is being refunded to your Mobile Money.`
    : "Please message us on WhatsApp if you have questions.";
  return `Elite Data: we could not complete order ${shortRef(opts.reference)} because ${because}. ${tail}`;
}

export interface SmsOrder {
  reference: string;
  customer_name?: string | null;
  network?: string | null;
  bundle_size?: string | null;
  amount?: number | null;
  phone?: string | null;
}

export const SMS_TEMPLATES = [
  { id: "delivered", label: "Data delivered" },
  { id: "delayed", label: "Delayed" },
  { id: "refunded", label: "Refund sent" },
  { id: "wrong_number", label: "Wrong number" },
] as const;

export type SmsTemplateId = (typeof SMS_TEMPLATES)[number]["id"];

export function smsTemplate(id: SmsTemplateId, o: SmsOrder): string {
  const first = (o.customer_name ?? "").trim().split(" ")[0];
  const hi = first && first !== o.phone ? `Hi ${first}, ` : "";
  const ref = shortRef(o.reference);
  const bundle = `${(o.network ?? "").toUpperCase()} ${o.bundle_size ?? ""}`.trim();
  switch (id) {
    case "delivered":
      return `Elite Data: ${hi}your ${bundle} has been delivered. Ref ${ref}. Thank you for choosing Elite Data.`;
    case "delayed":
      return `Elite Data: ${hi}your ${bundle} order ${ref} is taking longer than usual. We are working on it and will update you soon. Thank you for your patience.`;
    case "refunded":
      return `Elite Data: ${hi}your refund of GH₵${Number(o.amount ?? 0).toFixed(2)} for order ${ref} has been sent to your Mobile Money. Thank you for your patience.`;
    case "wrong_number":
      return `Elite Data: ${hi}we could not deliver order ${ref} because the number looks wrong. Please reply with the correct number and we will send it again.`;
  }
}

/** Number of SMS parts a message uses (160 characters, then 153 per part). */
export function smsParts(message: string): number {
  const n = message.length;
  if (n === 0) return 0;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}
