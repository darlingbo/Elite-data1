import { NextRequest } from "next/server";
import { getPaymentAttempt, markPaymentAttemptStatus } from "@/lib/payment-attempt";
import { getCollection, normalizeCollectionStatus } from "@/lib/yebeck";

/**
 * Endpoint receiving Yebeck webhook events (either directly or forwarded by Silent Echo router).
 */
export async function POST(request: NextRequest) {
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
    await markPaymentAttemptStatus(attempt.reference, normalizedStatus);

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

