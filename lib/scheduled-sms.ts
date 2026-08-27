import { supabase } from "@/lib/supabase";
import { sendCustomerSMS } from "@/lib/sms";

export async function processDueScheduledSms(): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: due, error } = await supabase
    .from("sms_scheduled")
    .select("id,phones,message")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const job of due ?? []) {
    const { data: claimed } = await supabase
      .from("sms_scheduled")
      .update({ status: "sending" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const results = await Promise.all(
      (job.phones ?? []).map((phone: string) => sendCustomerSMS(phone, String(job.message))),
    );
    const ok = results.length > 0 && results.every((result) => result.ok);
    const providerMessage = results.map((result) => result.message).filter(Boolean).join("; ").slice(0, 500);
    await supabase.from("sms_scheduled").update({
      status: ok ? "sent" : "failed",
      provider_message: providerMessage,
      sent_at: ok ? new Date().toISOString() : null,
    }).eq("id", job.id).eq("status", "sending");
    if (ok) sent += 1;
    else failed += 1;
  }
  return { processed: sent + failed, sent, failed };
}
