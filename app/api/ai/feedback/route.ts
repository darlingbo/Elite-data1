import { supabase } from "@/lib/supabase";
import { rateLimitDb } from "@/lib/rate-limit";

export async function PATCH(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`ai-feedback:${ip}`, 20, 60 * 60_000)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { messageId?: string; feedback?: number };
  if (!/^[0-9a-f-]{36}$/i.test(String(body.messageId)) || ![-1, 1].includes(Number(body.feedback))) return Response.json({ error: "Invalid feedback" }, { status: 400 });
  await supabase.from("ai_activity").update({ feedback: Number(body.feedback) }).eq("id", body.messageId).eq("scope", "customer").eq("role", "assistant");
  return Response.json({ success: true });
}
