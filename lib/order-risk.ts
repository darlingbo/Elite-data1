import { supabase } from "@/lib/supabase";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { auditLog } from "@/lib/audit";
import { sendAdminAlert } from "@/lib/telegram";

export type OrderRiskDecision = {
  allow: boolean;
  level: "low" | "medium" | "high";
  reasons: string[];
  source: "rules" | "rules+ai";
};

export async function isOrderGuardEnabled(): Promise<boolean> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "ai_order_guard_enabled")
    .maybeSingle();
  return data?.value !== "0";
}

function isWalletReference(reference: string): boolean {
  return reference.startsWith("AGTWALLET-") ||
    reference.startsWith("API-") ||
    reference.startsWith("AGTAPI-");
}

export async function assessOrderRisk(reference: string): Promise<OrderRiskDecision> {
  const { data: order } = await supabase
    .from("orders")
    .select("reference,paystack_reference,phone,network,bundle_size,amount,cost_price,agent_commission,created_at,status")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) return { allow: false, level: "high", reasons: ["Order not found"], source: "rules" };

  const reasons: string[] = [];
  const phone = String(order.phone ?? "").replace(/\D/g, "");
  const amount = Number(order.amount);
  const cost = Number(order.cost_price ?? 0);
  const commission = Number(order.agent_commission ?? 0);

  if (!/^(?:233|0)?[235]\d{8}$/.test(phone)) reasons.push("Invalid Ghana recipient number");
  if (!Number.isFinite(amount) || amount <= 0) reasons.push("Invalid selling amount");
  if (!Number.isFinite(cost) || cost < 0) reasons.push("Invalid cost price");
  if (cost + commission > amount) reasons.push("Order would create a negative margin");
  if (!order.paystack_reference && !isWalletReference(reference)) reasons.push("Verified payment reference is missing");

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("orders")
    .select("reference,network,bundle_size,amount,status")
    .eq("phone", order.phone)
    .gte("created_at", since)
    .neq("reference", reference)
    .limit(10);

  const duplicates = (recent ?? []).filter((candidate) =>
    candidate.network === order.network &&
    candidate.bundle_size === order.bundle_size &&
    Number(candidate.amount) === amount,
  );
  if (duplicates.length >= 2) reasons.push("Repeated matching orders within 10 minutes");

  if (reasons.length > 0) {
    const decision: OrderRiskDecision = { allow: false, level: "high", reasons, source: "rules" };
    await auditLog("ai_order_guard_hold", { reference, ...decision });
    sendAdminAlert(
      `🛡️ <b>ORDER HELD BY AI GUARD</b>\n<code>${reference}</code>\nReason: ${reasons.join("; ")}\nReview it in the approval queue.`,
    ).catch(() => {});
    return decision;
  }

  // DeepSeek is advisory and receives no name, email, full phone number, API
  // credentials or payment secrets. If it is unavailable, safe rules continue.
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const reply = await generateDeepSeekReply([
        {
          role: "system",
          content: "You are an order-risk classifier. Reply with only ALLOW or HOLD followed by a colon and one short reason. HOLD only for a clear anomaly. Never invent missing facts.",
        },
        {
          role: "user",
          content: JSON.stringify({
            network: order.network,
            bundle: order.bundle_size,
            amount,
            cost,
            commission,
            matching_recent_orders: duplicates.length,
            other_recent_orders: (recent ?? []).length,
            phone_suffix: phone.slice(-3),
          }),
        },
      ]);
      if (/^HOLD\b/i.test(reply)) {
        const reason = reply.split(":").slice(1).join(":").trim() || "AI detected an unusual order pattern";
        const decision: OrderRiskDecision = { allow: false, level: "medium", reasons: [reason], source: "rules+ai" };
        await auditLog("ai_order_guard_hold", { reference, ...decision });
        sendAdminAlert(`🤖 <b>AI REVIEW REQUIRED</b>\n<code>${reference}</code>\n${reason}`).catch(() => {});
        return decision;
      }
      return { allow: true, level: "low", reasons: [], source: "rules+ai" };
    } catch {
      // AI outages must not change deterministic payment and safety controls.
    }
  }

  return { allow: true, level: "low", reasons: [], source: "rules" };
}
