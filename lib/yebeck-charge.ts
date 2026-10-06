import { createCollection, normalizeCollectionStatus, YebeckApiError, YebeckNetwork } from "@/lib/yebeck";
import { createPaymentAttempt, recordYebeckCollection, StoredPaymentAttempt } from "@/lib/payment-attempt";

export type StartYebeckChargeInput = {
  amountPesewas: number;
  reference: string;
  type: StoredPaymentAttempt["payment_type"];
  payerPhone: string;
  provider: YebeckNetwork;
  customerName?: string;
  narration?: string;
  metadata?: Record<string, unknown>;
};

export type StartYebeckChargeResult = {
  ok: boolean;
  reference: string;
  status: "pending" | "success" | "failed" | "unknown";
  message?: string;
};

export async function startYebeckCharge(input: StartYebeckChargeInput): Promise<StartYebeckChargeResult> {
  if (!process.env.YEBECK_API_KEY?.trim()) {
    return {
      ok: false,
      reference: input.reference,
      status: "failed",
      message: "Mobile Money checkout is currently unavailable. Please contact support.",
    };
  }

  let attemptCreated = false;
  try {
    await createPaymentAttempt({
      reference: input.reference,
      paymentType: input.type,
      amountPesewas: input.amountPesewas,
      metadata: {
        ...(input.metadata ?? {}),
        payerPhone: input.payerPhone,
        provider: input.provider,
        customerName: input.customerName,
      },
    });
    attemptCreated = true;

    const collection = await createCollection({
      amountPesewas: input.amountPesewas,
      network: input.provider,
      customerMsisdn: input.payerPhone,
      customerName: input.customerName,
      narration: input.narration || `EliteData ${input.type.replace(/_/g, " ")}`,
    });

    await recordYebeckCollection(input.reference, collection);
    const status = normalizeCollectionStatus(collection.status);

    return {
      ok: status === "pending" || status === "success",
      reference: input.reference,
      status,
      message:
        status === "pending"
          ? "Please check your phone and approve the Mobile Money prompt."
          : status === "success"
          ? "Payment approved successfully."
          : collection.message || "Payment request failed.",
    };
  } catch (err) {
    console.error("[startYebeckCharge] failed", {
      reference: input.reference,
      error: err instanceof Error ? err.message : String(err),
    });

    if (err instanceof YebeckApiError) {
      const msg =
        err.statusCode === 422
          ? "Yebeck could not process this number or network. Please verify your phone number and network."
          : err.statusCode === 429
          ? "Too many payment requests. Please wait a moment before trying again."
          : `Payment provider error (${err.statusCode}). Please try again.`;
      return { ok: false, reference: input.reference, status: "failed", message: msg };
    }

    return {
      ok: false,
      reference: input.reference,
      status: attemptCreated ? "unknown" : "failed",
      message: err instanceof Error ? err.message : "Could not initiate Mobile Money payment.",
    };
  }
}
