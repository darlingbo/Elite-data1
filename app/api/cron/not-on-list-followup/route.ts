import { supabase } from "@/lib/supabase";
import { sendCustomerSMS, orderNotOnListApologySMS } from "@/lib/sms";

export const maxDuration = 60;

// A "not on beneficiary list / new number" order promises delivery within 72
// hours. If it is still not delivered by then, send one apology SMS. No refund.
const APOLOGY_AFTER_HOURS = 72;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - APOLOGY_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const { data: due, error } = await supabase
    .from("orders")
    .select("reference, phone, network, bundle_size, customer_name")
    .eq("status", "not_on_list")
    .is("not_on_list_apology_sent_at", null)
    .not("not_on_list_at", "is", null)
    .lte("not_on_list_at", cutoff)
    .limit(200);
  if (error) {
    console.error("[cron/not-on-list-followup] load failed", { error: error.message });
    return Response.json({ error: "Could not load the follow-up queue" }, { status: 500 });
  }

  let sent = 0;
  for (const order of due ?? []) {
    // Claim the row first so a concurrent run cannot double-send.
    const { data: claimed } = await supabase
      .from("orders")
      .update({ not_on_list_apology_sent_at: new Date().toISOString() })
      .eq("reference", order.reference)
      .eq("status", "not_on_list")
      .is("not_on_list_apology_sent_at", null)
      .select("reference")
      .maybeSingle();
    if (!claimed) continue;

    const result = await sendCustomerSMS(
      order.phone,
      orderNotOnListApologySMS(
        order.customer_name ?? "Customer",
        order.network ?? "",
        order.bundle_size ?? "",
        order.reference,
      ),
    );
    if (result.ok) {
      sent += 1;
    } else {
      // Release the claim so a later run retries instead of silently dropping it.
      await supabase
        .from("orders")
        .update({ not_on_list_apology_sent_at: null })
        .eq("reference", order.reference);
    }
  }

  return Response.json({ due: (due ?? []).length, sent });
}
