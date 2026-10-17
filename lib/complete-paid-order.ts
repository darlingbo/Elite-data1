import { supabase } from "@/lib/supabase";
import { getPaymentAttempt, verifyYebeckPayment, type StoredPaymentAttempt } from "@/lib/payment-attempt";
import { createPaidOrder } from "@/lib/order-create";
import { createPaidVoucherOrder } from "@/lib/voucher-create";
import { createPaidBulkOrder } from "@/lib/bulk-create";

/**
 * What the customer's screen needs to show after a payment.
 * `order` is the answer from the matching create function (success, pendingApproval, ...).
 */
export type PaidOrderResult =
  | { state: "not_paid" }
  | { state: "not_supported" }
  | { state: "done"; order: Record<string, unknown> }
  | { state: "error"; message: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Kind = "data_order" | "voucher_order" | "bulk_order";

/**
 * A payment is confirmed by Yebeck: make sure the customer's order exists.
 *
 * This runs on the server whenever a payment is seen as paid (status check, webhook, Track
 * page), so the customer gets their order even if their browser was closed or lost signal
 * after approving the prompt. It works for data bundles, result-checker vouchers and bulk
 * top-ups, and it is safe to call many times and from many places at once: the first caller
 * creates the order, the others get that same order back.
 */
export async function completePaidOrder(reference: string): Promise<PaidOrderResult> {
  // Several checks for the same payment can arrive in the same instant (the screen, the
  // webhook, Track). On one server they share a single run; across servers the claim decides.
  const running = inFlight.get(reference);
  if (running) return running;
  const run = completeOnce(reference).finally(() => inFlight.delete(reference));
  inFlight.set(reference, run);
  return run;
}

const inFlight = new Map<string, Promise<PaidOrderResult>>();

async function completeOnce(reference: string): Promise<PaidOrderResult> {
  const attempt = await getPaymentAttempt(reference).catch(() => null);
  if (!attempt) return { state: "error", message: `Payment attempt not found: ${reference}` };
  const kind = attempt.payment_type as string;
  if (kind !== "data_order" && kind !== "voucher_order" && kind !== "bulk_order") return { state: "not_supported" };

  // Vouchers and bulk top-ups are made from the form the customer filled in. It is saved with the
  // payment when it starts. Payments started before that was added cannot be finished here.
  const meta = (attempt.metadata ?? {}) as Record<string, unknown>;
  const createBody = meta.create_body && typeof meta.create_body === "object" ? (meta.create_body as Record<string, unknown>) : null;
  if (kind !== "data_order" && !createBody) return { state: "not_supported" };

  let verified;
  try {
    verified = await verifyYebeckPayment(reference, kind);
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : String(err) };
  }
  if (verified.status !== "success") return { state: "not_paid" };

  const existing = await findOrder(kind, reference);
  if (existing) return { state: "done", order: existing };

  // One worker at a time. The payments table has a unique reference, so a second insert fails with
  // 23505 while the first worker is busy. If that worker never finishes we carry on after a few
  // seconds instead of leaving a paid order without an order. (Bulk top-ups claim it themselves.)
  if (kind !== "bulk_order") {
    const claim = await supabase.from("payments").insert({
      amount: Number(verified.attempt.amount_pesewas) / 100,
      method: "yebeck_order",
      reference,
      status: "processing",
    });
    if (claim.error?.code === "23505") {
      for (let i = 0; i < 6; i++) {
        await wait(1000);
        const found = await findOrder(kind, reference);
        if (found) return { state: "done", order: found };
      }
    }
  }

  let response: Response;
  if (kind === "data_order") {
    const phone = String(meta.recipient_phone ?? meta.phone ?? "").replace(/\s/g, "");
    const bundleId = String(meta.bundle_id ?? "");
    if (!phone || !bundleId) {
      return { state: "error", message: "The payment has no delivery details saved. Contact support with your payment reference." };
    }
    response = await createPaidOrder({
      name: String(meta.customer_name ?? phone),
      email: `${phone}@elitedata1.com`,
      phone,
      bundleId,
      paymentRef: reference,
      applyReferralCredit: meta.apply_referral_credit === true,
      referralVia: typeof meta.referral_via === "string" && meta.referral_via ? meta.referral_via : null,
      fastDelivery: false,
    });
  } else if (kind === "voucher_order") {
    response = await createPaidVoucherOrder({ ...createBody, paymentRef: reference });
  } else {
    response = await createPaidBulkOrder({ ...createBody, paymentRef: reference });
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok && json.success) return { state: "done", order: json };
  // Another worker may have won the race: the order exists even though this call said no.
  const after = await findOrder(kind, reference);
  if (after) return { state: "done", order: after };
  return { state: "error", message: String(json.error ?? "Your order could not be created yet.") };
}

/** The order for this payment, in the same shape the create functions answer with. */
async function findOrder(kind: Kind, reference: string): Promise<Record<string, unknown> | null> {
  if (kind === "bulk_order") {
    const { data } = await supabase.from("orders").select("reference, phone, status").eq("paystack_reference", reference).limit(200);
    const rows = (data ?? []) as Array<{ reference: string; phone: string; status: string }>;
    if (rows.length === 0) return null;
    const queued = (s: string) => !["failed", "rejected", "FRAUD"].includes(s);
    return {
      success: true,
      total: rows.length,
      pendingApproval: rows.filter((r) => r.status === "pending_approval").length,
      failed: rows.filter((r) => !queued(r.status)).length,
      outcomes: rows.map((r) => ({ phone: r.phone, ref: r.reference, status: queued(r.status) ? "pending_approval" : "failed" })),
    };
  }
  const { data } = await supabase.from("orders").select("reference, status").eq("reference", reference).maybeSingle();
  if (!data) return null;
  const status = String(data.status ?? "");
  return {
    success: true,
    reference: data.reference,
    status,
    ...(status === "pending_approval" ? { pendingApproval: true } : {}),
  };
}

export type { StoredPaymentAttempt };
