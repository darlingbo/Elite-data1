import { processAutoApprovalQueue } from "@/lib/order-approval";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await processAutoApprovalQueue());
  } catch (error) {
    console.error("[cron/auto-approval] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Automatic approval queue processing failed" }, { status: 500 });
  }
}
