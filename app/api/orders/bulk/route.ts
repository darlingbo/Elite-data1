import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { bundles } from "@/lib/bundles";
import { sendAdminAlert } from "@/lib/telegram";

const PLATFORM_FEE_RATE = 0.02;
const MAX_PHONES = 50;

const networkApiMap: Record<string, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
};

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

  // Idempotency — don't double-process same Paystack ref
  const { data: existing } = await supabase
    .from("orders")
    .select("reference")
    .eq("reference", paystackRef)
    .maybeSingle();
  if (existing) {
    return Response.json({ error: "This payment has already been processed." }, { status: 400 });
  }

  // Verify Paystack payment
  const expectedKobo = Math.round(price * (1 + PLATFORM_FEE_RATE) * phoneList.length * 100);

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

  const unitCharged = parseFloat((price * (1 + PLATFORM_FEE_RATE)).toFixed(2));
  const adminCommission = parseFloat(Math.max(0, price - costPrice).toFixed(2));

  // Deliver all numbers in parallel
  const results = await Promise.allSettled(
    phoneList.map(async (phone, i) => {
      const ref = `${paystackRef}-${String(i + 1).padStart(2, "0")}`;

      try {
        await supabase.from("orders").insert({
          reference: ref,
          customer_name: companyName || "Business Order",
          phone,
          network,
          bundle_size: size,
          bundle_size_gb: sizeGB,
          amount: unitCharged,
          cost_price: costPrice,
          admin_commission: adminCommission,
          agent_commission: 0,
          status: "pending",
        });
      } catch { /* non-fatal */ }

      try {
        const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
          body: JSON.stringify({
            network: networkApiMap[network] ?? network.toUpperCase(),
            Phone: phone,
            Datasize: sizeGB,
            reference: ref,
          }),
        });
        const invBody = await invRes.json().catch(() => ({}));
        const ok =
          invRes.ok ||
          invBody.success === true ||
          invBody.status === "success" ||
          invBody.status === "00";

        if (ok) {
          await supabase.from("orders").update({ status: "completed" }).eq("reference", ref);
          return { phone, ref, status: "delivered" as const };
        } else {
          await supabase.from("orders").update({ status: "failed" }).eq("reference", ref);
          return { phone, ref, status: "failed" as const };
        }
      } catch {
        await supabase.from("orders").update({ status: "failed" }).eq("reference", ref);
        return { phone, ref, status: "failed" as const };
      }
    })
  );

  const outcomes = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { phone: phoneList[i], ref: `${paystackRef}-${String(i + 1).padStart(2, "0")}`, status: "failed" as const }
  );

  const delivered = outcomes.filter((o) => o.status === "delivered").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const totalCharged = parseFloat((unitCharged * phoneList.length).toFixed(2));

  await sendAdminAlert(
    `🏢 BULK ORDER\nRef: ${paystackRef}\nCompany: ${companyName || "—"}\nContact: ${contactPhone}\nBundle: ${network.toUpperCase()} ${size} × ${phoneList.length}\nTotal: GH₵${totalCharged.toFixed(2)}\n✅ Delivered: ${delivered}/${phoneList.length}${failed > 0 ? `\n❌ Failed: ${failed} — manual follow-up needed` : ""}`
  ).catch(() => {});

  return Response.json({ success: true, total: phoneList.length, delivered, failed, outcomes });
}
