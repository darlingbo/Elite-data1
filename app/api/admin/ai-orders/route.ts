import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { generateDeepSeekReply } from "@/lib/deepseek";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

async function lookupOrder(reference: string): Promise<string> {
  const { data: order } = await supabase
    .from("orders")
    .select("reference, customer_name, phone, network, bundle_size, amount, status, created_at, agent_commission, admin_commission")
    .eq("reference", reference)
    .maybeSingle();
  if (!order) return `No order found with reference "${reference}".`;
  return `Order ${reference}:\n• Status: ${order.status}\n• Customer: ${order.customer_name ?? "—"} (${order.phone})\n• Bundle: ${(order.network ?? "").toUpperCase()} ${order.bundle_size}\n• Amount: GH₵${Number(order.amount).toFixed(2)}\n• Agent commission: GH₵${Number(order.agent_commission).toFixed(2)}\n• Admin profit: GH₵${Number(order.admin_commission).toFixed(2)}\n• Date: ${new Date(order.created_at).toLocaleString("en-GH")}`;
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { message } = await request.json() as { message?: string };
  if (!message?.trim()) return Response.json({ error: "message is required" }, { status: 400 });

  const systemPrompt = `You are Elite Data's READ-ONLY order analyst. Reply with JSON only:
{"action":"lookup|advice|refuse","reference":"","reply":""}
You may extract an order reference for lookup or provide operational advice. You are permanently forbidden from approving, rejecting, retrying, delivering, refunding, editing, cancelling, changing status, force-completing, crediting commission, changing prices, or changing stock. If asked to perform any mutation, use action "refuse" and explain that the admin must use reviewed manual controls.`;

  try {
    const text = await generateDeepSeekReply([
      { role: "system", content: systemPrompt },
      { role: "user", content: message.slice(0, 1_000) },
    ]);
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as { action?: string; reference?: string; reply?: string };
    if (parsed.action === "lookup" && parsed.reference?.trim()) {
      return Response.json({ reply: await lookupOrder(parsed.reference.trim()), action: "lookup", reference: parsed.reference.trim() });
    }
    return Response.json({
      reply: parsed.action === "refuse"
        ? "AI is read-only and cannot perform that action. Use the reviewed admin controls yourself."
        : String(parsed.reply ?? "I can analyze or look up an order, but I cannot change anything."),
      action: parsed.action ?? "advice",
      reference: "",
    });
  } catch {
    return Response.json({ reply: "The read-only AI analyst is temporarily unavailable." }, { status: 503 });
  }
}
