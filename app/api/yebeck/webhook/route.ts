import { NextRequest } from "next/server";
import { getPaymentAttempt, markPaymentAttemptStatus } from "@/lib/payment-attempt";
import { getCollection, normalizeCollectionStatus } from "@/lib/yebeck";
import { tooMany } from "@/lib/public-limit";
import { completePaidDataOrder } from "@/lib/complete-paid-order";

export const maxDuration = 60;

/**
 * Endpoint receiving Yebeck webhook events (either directly or forwarded by Silent Echo router).
 */
export async function POST(request: NextRequest) {
  const blocked = await tooMany(request, "momo-webhook", 900, 60000);
  if (blocked) return blocked;

  let body: { event?: unknown; data?: { reference?: unknown; type?: unknown; status?: unknown } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const providerReference = typeof body.data?.reference === "string" ? body.data.reference.trim() : "";
  if (!providerReference) {
    return Response.json({ ok: true, ignored: true, reason: "No reference provided" });
  }

  const attempt = await getPaymentAttempt(providerReference);
  if (!attempt) {
    // Payment not recognized on EliteData either
    return Response.json({ ok: true, ignored: true, reason: "Attempt not found on EliteData" });
  }

  try {
    const collection = await getCollection(providerReference);
    const normalizedStatus = normalizeCollectionStatus(collection.status);
    await markPaymentAttemptStatus(attempt.reference, normalizedStatus, String(collection.status ?? ""));

    // Paid: make sure the customer's order exists even if their browser has gone.
    if (normalizedStatus === "success" && attempt.payment_type === "data_order") {
      await completePaidDataOrder(attempt.reference).catch((e) =>
        console.error("[yebeck/webhook] could not create the order", { reference: attempt.reference, error: e instanceof Error ? e.message : String(e) }));
    }

    return Response.json({
      ok: true,
      reference: attempt.reference,
      status: normalizedStatus,
    });
  } catch (err) {
    console.error("[yebeck/webhook] Error verifying collection", {
      providerReference,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, message: "Could not verify collection" }, { status: 500 });
  }
}

