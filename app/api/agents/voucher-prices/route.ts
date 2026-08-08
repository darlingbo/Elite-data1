import { NextRequest } from "next/server";
import { requireAgentSession } from "@/lib/agentAuth";
import { supabase } from "@/lib/supabase";

export const VOUCHER_WHOLESALE_PRICE = 17;
const TYPES = new Set(["BECE", "WASSCE"]);

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });
  const auth = requireAgentSession(request, agentId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabase
    .from("agent_voucher_prices")
    .select("voucher_type,sell_price,active,locked_by_sub_admin_id,locked_at")
    .eq("agent_id", agentId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const prices = Object.fromEntries((data ?? []).map(row => [row.voucher_type, Number(row.sell_price)]));
  const locks = Object.fromEntries((data ?? []).map(row => [row.voucher_type, Boolean(row.locked_by_sub_admin_id)]));
  return Response.json({ wholesalePrice: VOUCHER_WHOLESALE_PRICE, prices, locks });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    agentId?: string; referralCode?: string; voucherType?: string; sellPrice?: number;
  } | null;
  if (!body?.agentId || !body.referralCode || !body.voucherType || body.sellPrice === undefined) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
  }
  const auth = requireAgentSession(request, body.agentId, { requireFull: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const voucherType = body.voucherType.toUpperCase();
  const sellPrice = Math.round(Number(body.sellPrice) * 100) / 100;
  if (!TYPES.has(voucherType)) return Response.json({ error: "Voucher type must be BECE or WASSCE." }, { status: 400 });
  if (!Number.isFinite(sellPrice) || sellPrice < VOUCHER_WHOLESALE_PRICE) {
    return Response.json({ error: `Sell price must be at least GH₵${VOUCHER_WHOLESALE_PRICE}.` }, { status: 400 });
  }

  const { data: agent } = await supabase.from("agents").select("id").eq("id", body.agentId)
    .eq("referral_code", body.referralCode.toUpperCase()).eq("status", "approved").maybeSingle();
  if (!agent) return Response.json({ error: "Unauthorized." }, { status: 403 });

  const { data: existing } = await supabase.from("agent_voucher_prices")
    .select("locked_by_sub_admin_id").eq("agent_id", body.agentId)
    .eq("voucher_type", voucherType).maybeSingle();
  if (existing?.locked_by_sub_admin_id) {
    return Response.json({ error: "This voucher price is locked by your Pro sub-admin. Ask them to change or unlock it." }, { status: 423 });
  }

  const { error } = await supabase.from("agent_voucher_prices").upsert({
    agent_id: body.agentId, voucher_type: voucherType, sell_price: sellPrice,
    active: true, updated_at: new Date().toISOString(),
  }, { onConflict: "agent_id,voucher_type" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await supabase.from("agent_price_history").insert({
    target_agent_id: body.agentId, actor_type: "agent", price_kind: "voucher",
    item_key: voucherType, new_price: sellPrice, action: "set",
  });
  return Response.json({ success: true, wholesalePrice: VOUCHER_WHOLESALE_PRICE, sellPrice });
}
