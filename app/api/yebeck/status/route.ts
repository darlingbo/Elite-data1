import { NextRequest } from "next/server";
import { verifyYebeckPayment } from "@/lib/payment-attempt";
import { tooMany } from "@/lib/public-limit";

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
    return Response.json({
      ok: true,
      reference,
      status: verified.status,
      message:
        verified.status === "success"
          ? "Payment approved successfully."
          : verified.status === "failed"
          ? "Payment was declined or cancelled on the phone."
          : "Still waiting for approval on your phone.",
    });
  } catch (err) {
    return Response.json({
      ok: false,
      reference,
      status: "pending",
      message: err instanceof Error ? err.message : "Checking status...",
    });
  }
}

