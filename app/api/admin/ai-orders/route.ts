import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

const networkApiName: Record<string, string> = {
  mtn: "MTN", telecel: "TELECEL", airteltigo: "AT ISHARE",
};

async function logOrderAction(reference: string, action: string, note: string, details?: Record<string, unknown>) {
  try { await supabase.from("order_logs").insert({ reference, action, note, details }); } catch { /* non-critical */ }
}

async function doRetry(reference: string): Promise<string> {
  const { data: order } = await supabase
    .from("orders")
    .select("reference, network, bundle_size, bundle_size_gb, phone, status, cost_price, agent_id, agent_commission, admin_commission")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return `Order ${reference} not found.`;

  let inventorOk = false;
  try {
    const net = (order.network ?? "").toLowerCase();
    const invRes = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiName[net] ?? net.toUpperCase(),
        Phone: order.phone,
        Datasize: order.bundle_size_gb ?? (() => {
          const m = (order.bundle_size ?? "").match(/(\d+(?:\.\d+)?)\s*gb/i);
          return m ? parseFloat(m[1]) : 1;
        })(),
        reference: order.reference,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await invRes.json().catch(() => ({})) as Record<string, unknown>;
    inventorOk = invRes.ok || body.success === true || body.status === "success" || body.status === "00" ||
      (invRes.status === 409 && String(((body.existingOrder as Record<string,unknown>)?.status ?? "")).toLowerCase().includes("complet"));
    if (inventorOk) {
      await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);
      await logOrderAction(reference, "ai_retry", "AI retried delivery — completed via Inventor");
      return `✅ Order ${reference} retried successfully — now completed.`;
    } else {
      await logOrderAction(reference, "ai_retry_failed", "AI tried retry — Inventor failed", { response: JSON.stringify(body).slice(0, 200) });
      return `Retry failed for ${reference}. Inventor did not confirm delivery.`;
    }
  } catch (e) {
    return `Retry error for ${reference}: ${String(e)}`;
  }
}

async function doForceComplete(reference: string): Promise<string> {
  const { data: order } = await supabase
    .from("orders")
    .select("reference, phone, network, bundle_size, agent_id, agent_commission, amount, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return `Order ${reference} not found.`;
  if (order.status === "completed") return `Order ${reference} is already completed.`;

  await supabase.from("orders").update({ status: "completed" }).eq("reference", reference);

  if (order.agent_id && order.agent_commission) {
    const { data: ag } = await supabase.from("agents").select("commission_balance, total_sales, total_revenue").eq("id", order.agent_id).maybeSingle();
    if (ag) {
      await supabase.from("agents").update({
        commission_balance: (Number(ag.commission_balance) || 0) + Number(order.agent_commission),
        total_sales: (Number(ag.total_sales) || 0) + 1,
        total_revenue: (Number(ag.total_revenue) || 0) + Number(order.amount),
        updated_at: new Date().toISOString(),
      }).eq("id", order.agent_id);
    }
  }

  await logOrderAction(reference, "ai_force_complete", "AI marked order as completed (force complete)", {
    phone: order.phone, network: order.network, bundle: order.bundle_size,
  });

  return `✅ Order ${reference} marked as completed. Agent commission credited if applicable.`;
}

async function doChangeStatus(reference: string, newStatus: string): Promise<string> {
  const valid = ["pending", "processing", "completed", "failed"];
  const s = newStatus.toLowerCase();
  if (!valid.includes(s)) return `Invalid status "${newStatus}". Use: pending, processing, completed, failed.`;

  const { data: order } = await supabase.from("orders").select("status").eq("reference", reference).maybeSingle();
  if (!order) return `Order ${reference} not found.`;

  await supabase.from("orders").update({ status: s }).eq("reference", reference);
  await logOrderAction(reference, "ai_status_change", `AI changed status from ${order.status} to ${s}`, {
    from: order.status, to: s,
  });

  return `✅ Order ${reference} status changed from "${order.status}" to "${s}".`;
}

async function doPatchOrder(reference: string, fields: Record<string, unknown>): Promise<string> {
  const allowed = ["bundle_size", "cost_price", "agent_commission", "admin_commission", "customer_name", "phone"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) patch[key] = fields[key];
  }
  if (Object.keys(patch).length === 0) return "No valid fields to update.";

  const { error } = await supabase.from("orders").update(patch).eq("reference", reference);
  if (error) return `Failed to update order: ${error.message}`;

  await logOrderAction(reference, "ai_patch", `AI updated order fields: ${Object.keys(patch).join(", ")}`, patch);
  return `✅ Updated order ${reference}: ${Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(", ")}.`;
}

async function doLookup(reference: string): Promise<string> {
  const { data: order } = await supabase
    .from("orders")
    .select("reference, customer_name, phone, network, bundle_size, amount, status, created_at, agent_id, cost_price, admin_commission, agent_commission")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return `No order found with reference "${reference}".`;
  return `Order ${reference}:\n• Status: ${order.status}\n• Customer: ${order.customer_name ?? "—"} (${order.phone})\n• Bundle: ${(order.network ?? "").toUpperCase()} ${order.bundle_size}\n• Amount: GH₵${Number(order.amount).toFixed(2)}\n• Agent commission: GH₵${Number(order.agent_commission).toFixed(2)}\n• Admin profit: GH₵${Number(order.admin_commission).toFixed(2)}\n• Date: ${new Date(order.created_at).toLocaleString("en-GH")}`;
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { message } = await request.json() as { message: string };
  if (!message?.trim()) return Response.json({ error: "message is required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "AI not configured." }, { status: 503 });

  // Ask Claude what to do
  const systemPrompt = `You are an order management AI assistant for Elite Data Ghana admin panel.
You help admins manage orders by understanding natural language commands.

You must respond with a JSON object ONLY — no extra text. Format:
{"action":"ACTION","reference":"ORDER_REF","params":{...},"reply":"Human-readable explanation of what you will do"}

Available actions:
- "retry" — re-attempt delivery via Inventor. params: {}
- "force_complete" — mark order as completed, credit agent. params: {}
- "change_status" — change order status. params: { "status": "pending|processing|completed|failed" }
- "patch" — edit order fields. params: { "bundle_size"?, "cost_price"?, "agent_commission"?, "admin_commission"?, "customer_name"?, "phone"? }
- "lookup" — show order details. params: {}
- "unknown" — if you don't understand. reference: "", params: {}, reply: "I didn't understand..."

Extract the order reference from the message (usually looks like TRX-xxx, REF-xxx, or similar alphanumeric codes).
If no reference is found and the action requires one, use action "unknown".`;

  let aiResponse: Record<string, unknown> = {};
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json() as Record<string, unknown>;
    const text = ((data.content as Array<{ type: string; text: string }>)?.[0]?.text ?? "").trim();
    aiResponse = JSON.parse(text);
  } catch {
    return Response.json({ reply: "Sorry, I couldn't understand that. Please try again." });
  }

  const action = String(aiResponse.action ?? "unknown");
  const reference = String(aiResponse.reference ?? "").trim();
  const params = (aiResponse.params as Record<string, unknown>) ?? {};

  let result = "";
  if (action === "unknown" || !reference) {
    result = String(aiResponse.reply ?? "I didn't understand. Try something like: 'retry order TRX-1234' or 'mark REF-5678 as completed'.");
  } else if (action === "retry") {
    result = await doRetry(reference);
  } else if (action === "force_complete") {
    result = await doForceComplete(reference);
  } else if (action === "change_status") {
    result = await doChangeStatus(reference, String(params.status ?? ""));
  } else if (action === "patch") {
    result = await doPatchOrder(reference, params);
  } else if (action === "lookup") {
    result = await doLookup(reference);
  } else {
    result = `Unknown action: ${action}`;
  }

  return Response.json({ reply: result, action, reference });
}
