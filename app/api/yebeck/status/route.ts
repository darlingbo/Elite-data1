import { NextRequest } from "next/server";
import { verifyYebeckPayment } from "@/lib/payment-attempt";
import { completePaidDataOrder } from "@/lib/complete-paid-order";
import { tooMany } from "@/lib/public-limit";

// Creating the order after a paid status can take a few seconds (alerts, approval).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const blocked = await tooMany(request, "momo-status", 500, 600000);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference")?.trim();

  if (!reference) {
    return Response.json({ ok: false, message: "Reference is required." }, { status: 400 });
  }

  try {
    const verified = await verifyYebeckPayment(reference);

    // Paid data order: the server makes sure the order exists, so the customer sees the
    // confirmation even if the order step in their browser never runs.
    let order: Record<string, unknown> | undefined;
    let orderError: string | undefined;
    if (verified.status === "success" && verified.attempt.payment_type === "data_order") {
      const done = await completePaidDataOrder(reference);
      if (done.state === "done") order = done.order;
      else if (done.state === "error") orderError = done.message;
    }

    return Response.json({
      ok: true,
      reference,
      status: verified.status,
      // The status word Yebeck gave, exactly as received. Helps when a payment looks stuck.
      providerStatus: verified.attempt.provider_status ?? null,
      order,
      orderError,
      message:
        verified.status === "success"
          ? "Payment approved successfully."
          : verified.status === "failed"
          ? "Payment was declined or cancelled on the phone."
          : "Still waiting for approval on your phone.",
    });
  } catch (err) {
    console.error("[yebeck/status] could not check the payment", {
      reference,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({
      ok: false,
      reference,
      status: "pending",
      message: err instanceof Error ? err.message : "Checking status...",
    });
  }
}
