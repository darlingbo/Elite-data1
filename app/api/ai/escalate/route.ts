import { createAiEscalation, logAiActivity } from "@/lib/ai-safety";
import { rateLimitDb } from "@/lib/rate-limit";
import { sendAdminAlert, tgEscape } from "@/lib/telegram";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`ai-escalate:${ip}`, 3, 60 * 60_000)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { sessionId?: string; summary?: string };
  const sessionId = String(body.sessionId ?? "anonymous").slice(0, 80);
  const created = await createAiEscalation(sessionId, String(body.summary ?? "Customer requested human assistance").slice(0, 2_000));
  await logAiActivity({ scope: "customer", sessionId, role: "system", content: created.summary, status: "escalated" });
  await sendAdminAlert(`🧠 <b>AI Support Escalation</b>\n\n${tgEscape(created.summary)}\n\nID: <code>${tgEscape(String(created.id ?? ""))}</code>`).catch(() => {});
  return Response.json({ success: true, escalationId: created.id });
}
