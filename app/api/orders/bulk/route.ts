import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles } from "@/lib/bundles";
import { sendAdminAlert, sendNewOrderAlert } from "@/lib/telegram";
import { maybeAutoApprove } from "@/lib/order-approval";
import { addCurrency, fromMinorUnits, multiplyCurrency, percentageOf, roundCurrency, toMinorUnits } from "@/lib/finance";

const PLATFORM_FEE_RATE = 0.02;
const MAX_PHONES = 50;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { phones, bundleId, paystackRef, companyName, contactPhone } = body;

  if (!phones?.length || !bundleId || !paystackRef || !contactPhone) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }

  const phoneList: string[] = phones;
  if (phoneList.length < 2 || phoneList.length > MAX_PHONES) {
    return Response.json({ error: `Please provide 2–${MAX_PHONES} phone numbers.` }, { status: 400 });
  }

  // Resolve bundle pricing
  const staticBundle = bundles.find((b) => b.id === bundleId);
  const { data: dbBundle } = await supabase
    .from("bundle_prices")
    .select("price, cost_price, size_gb, network, size_label")
    .eq("id", bundleId)
    .eq("active", true)
    .maybeSingle();

  const price = Number(dbBundle?.price ?? staticBundle?.price ?? 0);
  const costPrice = Number(dbBundle?.cost_price ?? staticBundle?.costPrice ?? 0);
  const network = (dbBundle?.network ?? staticBundle?.network ?? "") as string;
  const size = dbBundle?.size_label ?? staticBundle?.size ?? bundleId;
  const sizeGB = Number(dbBundle?.size_gb ?? staticBundle?.sizeGB ?? 1);

  if (!price || !network) {
    return Response.json({ error: "Bundle not found." }, { status: 400 });
  }

  // Fast idempotency check for both new and legacy bulk orders. The payment
  // claim inserted after Paystack verification is the final concurrency guard.
  const [existingClaimResult, existingOrderResult, legacyOrdersResult] = await Promise.all([
    supabase.from("payments").select("id").eq("reference", paystackRef).limit(1).maybeSingle(),
    supabase.from("orders").select("reference").eq("paystack_reference", paystackRef).limit(1).maybeSingle(),
    supabase.from("orders").select("reference").like("reference", `${paystackRef}-%`).limit(MAX_PHONES),
  ]);
  const lookupError =
    existingClaimResult.error ?? existingOrderResult.error ?? legacyOrdersResult.error;
  if (lookupError) {
    return Response.json({ error: "Could not safely check this payment. Please try again." }, { status: 500 });
  }
  const legacyPrefix = `${paystackRef}-`;
  const legacyOrderExists = (legacyOrdersResult.data ?? []).some((row) =>
    row.reference.startsWith(legacyPrefix) &&
    /^\d{2}$/.test(row.reference.slice(legacyPrefix.length))
  );
  if (existingClaimResult.data || existingOrderResult.data || legacyOrderExists) {
    return Response.json({ error: "This payment has already been processed." }, { status: 400 });
  }

  // Verify Paystack payment
  const unitCharged = addCurrency(price, percentageOf(price, PLATFORM_FEE_RATE));
  const expectedKobo = toMinorUnits(multiplyCurrency(unitCharged, phoneList.length));

  let psData: Record<string, unknown> = {};
  try {
    const psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    psData = await psRes.json();
  } catch (err) {
    return Response.json({ error: `Could not reach Paystack: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const txnStatus = (psData.data as Record<string, unknown>)?.status;
  const txnAmount = Number((psData.data as Record<string, unknown>)?.amount ?? 0);
  const paid = psData.status === true && txnStatus === "success" && txnAmount >= expectedKobo;

  if (!paid) {
    return Response.json({
      error: `Payment verification failed. Expected GH₵${(expectedKobo / 100).toFixed(2)}, received GH₵${(txnAmount / 100).toFixed(2)}.`,
    }, { status: 400 });
  }

  const adminCommission = Math.max(0, roundCurrency(price - costPrice));
  const totalCharged = multiplyCurrency(unitCharged, phoneList.length);

  // Atomically claim the Paystack transaction. The unique reference index means
  // two retries can never both proceed to provider delivery.
  const { error: claimError } = await supabase.from("payments").insert({
    amount: fromMinorUnits(txnAmount),
    method: "paystack_bulk",
    reference: paystackRef,
    status: "processing",
  });
  if (claimError) {
    if (claimError.code === "23505") {
      return Response.json({ error: "This payment has already been processed." }, { status: 409 });
    }
    await sendAdminAlert(
      `BULK PAYMENT CLAIM FAILED\nRef: ${paystackRef}\nPaid: GHS ${(txnAmount / 100).toFixed(2)}\nNo delivery was attempted.\nError: ${claimError.message}`
    ).catch(() => {});
    return Response.json(
      { error: "Payment was received but the order could not be safely recorded. Contact support." },
      { status: 500 },
    );
  }

  // Save every paid number into the admin approval queue. Nothing is sent to
  // the delivery provider from this public route.
  const outcomes = await Promise.all(
    phoneList.map(async (phone, i) => {
      const ref = `${paystackRef}-${String(i + 1).padStart(2, "0")}`;

      try {
        const { error: orderSaveError } = await supabase.from("orders").insert({
          reference: ref,
          paystack_reference: paystackRef,
          payment_method: "paystack_bulk",
          customer_name: companyName || "Business Order",
          phone,
          network,
          bundle_size: size,
          bundle_size_gb: sizeGB,
          amount: unitCharged,
          cost_price: costPrice,
          admin_commission: adminCommission,
          agent_commission: 0,
          status: "pending_approval",
        });
        if (orderSaveError) throw new Error(`Order save failed: ${orderSaveError.message}`);
        return { phone, ref, status: "pending_approval" as const };
      } catch (error) {
        await sendAdminAlert(
          `BULK ORDER SAVE FAILED\nRef: ${ref}\nPhone: ${phone}\nNo delivery was attempted.\nError: ${error instanceof Error ? error.message : String(error)}`
        ).catch(() => {});
        return { phone, ref, status: "failed" as const };
      }
    })
  );

  const pendingApproval = outcomes.filter((outcome) => outcome.status === "pending_approval").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const claimStatus = failed === 0 ? "paid" : pendingApproval === 0 ? "failed" : "partial";
  const { error: claimUpdateError } = await supabase
    .from("payments")
    .update({ status: claimStatus })
    .eq("reference", paystackRef);
  if (claimUpdateError) {
    await sendAdminAlert(
      `BULK PAYMENT STATUS UPDATE FAILED\nRef: ${paystackRef}\nQueued: ${pendingApproval}/${phoneList.length}\nError: ${claimUpdateError.message}`
    ).catch(() => {});
  }

  await sendNewOrderAlert(
    `📦 <b>BULK ORDER — AWAITING APPROVAL</b>\n\n` +
    `🎯 Source: <b>Guest / business bulk checkout</b>\n` +
    `🏢 Company: ${companyName || "Not supplied"}\n` +
    `📞 Contact: <code>${contactPhone}</code>\n` +
    `📱 ${network.toUpperCase()} ${size} × ${phoneList.length}\n` +
    `💰 Total paid: GH₵${totalCharged.toFixed(2)}\n` +
    `✅ Queued: ${pendingApproval}/${phoneList.length}` +
    (failed > 0 ? `\n⚠️ Save failures: ${failed} — payment review required` : "") +
    `\n📎 Ref: <code>${paystackRef}</code>`
  ).catch(() => {});

  // Keep provider calls sequential so a bulk payment cannot create an unsafe
  // delivery burst. Each order is claimed atomically before it is sent.
  for (const outcome of outcomes) {
    if (outcome.status === "pending_approval") await maybeAutoApprove(outcome.ref);
  }

  return Response.json({
    success: true,
    total: phoneList.length,
    pendingApproval,
    failed,
    outcomes,
  });
}
