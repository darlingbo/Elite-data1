import { supabase } from "@/lib/supabase";
import { verifyYebeckPayment } from "@/lib/payment-attempt";
import { createPaidOrder } from "@/lib/order-create";

/**
 * What the customer's screen needs to show after a payment.
 * `order` is the answer from createPaidOrder (success, pendingApproval, failed, ...).
 */
export type PaidOrderResult =
  | { state: "not_paid" }
  | { state: "not_a_data_order" }
  | { state: "done"; order: Record<string, unknown> }
  | { state: "error"; message: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A data-order payment is confirmed by Yebeck: make sure the order exists.
 *
 * This runs on the server whenever the payment is seen as paid (status check, webhook,
 * Track page), so the customer gets their order even if their browser was closed or lost
 * signal after approving the prompt. It is safe to call many times and from many places
 * at once: the first caller creates the order, the others get that same order back.
 */
export async function completePaidDataOrder(reference: string): Promise<PaidOrderResult> {
  // Several checks for the same payment can arrive in the same instant (the screen, the
  // webhook, Track). On one server they share a single run; across servers the claim below decides.
  const running = inFlight.get(reference);
  if (running) return running;
  const run = completeOnce(reference).finally(() => inFlight.delete(reference));
  inFlight.set(reference, run);
  return run;
}

const inFlight = new Map<string, Promise<PaidOrderResult>>();

async function completeOnce(reference: string): Promise<PaidOrderResult> {
  let verified;
  try {
    verified = await verifyYebeckPayment(reference, "data_order");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/made for something else/i.test(message)) return { state: "not_a_data_order" };
    return { state: "error", message };
  }
  if (verified.status !== "success") return { state: "not_paid" };

  const existing = await findOrder(reference);
  if (existing) return { state: "done", order: existing };

  // One worker at a time. The payments table has a unique reference, so a second insert fails
  // with 23505 while the first worker is still busy. If that worker never finishes, we carry on
  // after a few seconds instead of leaving a paid order without an order.
  const claim = await supabase.from("payments").insert({
    amount: Number(verified.attempt.amount_pesewas) / 100,
    method: "yebeck_order",
    reference,
    status: "processing",
  });
  if (claim.error?.code === "23505") {
    for (let i = 0; i < 6; i++) {
      await wait(1000);
      const found = await findOrder(reference);
      if (found) return { state: "done", order: found };
    }
  }

  const meta = (verified.attempt.metadata ?? {}) as Record<string, unknown>;
  const phone = String(meta.recipient_phone ?? meta.phone ?? "").replace(/\s/g, "");
  const bundleId = String(meta.bundle_id ?? "");
  if (!phone || !bundleId) {
    return { state: "error", message: "The payment has no delivery details saved. Contact support with your payment reference." };
  }

  const response = await createPaidOrder({
    name: String(meta.customer_name ?? phone),
    email: `${phone}@elitedata1.com`,
    phone,
    bundleId,
    paymentRef: reference,
    applyReferralCredit: meta.apply_referral_credit === true,
    referralVia: typeof meta.referral_via === "string" && meta.referral_via ? meta.referral_via : null,
    fastDelivery: false,
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok && json.success) return { state: "done", order: json };
  // A second worker may have won the race: the order exists even though this call said no.
  const after = await findOrder(reference);
  if (after) return { state: "done", order: after };
  return { state: "error", message: String(json.error ?? "Your order could not be created yet.") };
}

async function findOrder(reference: string): Promise<Record<string, unknown> | null> {
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
