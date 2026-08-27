import { processDueScheduledSms } from "@/lib/scheduled-sms";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await processDueScheduledSms());
  } catch (error) {
    console.error("[cron/scheduled-sms] failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Scheduled SMS processing failed" }, { status: 500 });
  }
}
