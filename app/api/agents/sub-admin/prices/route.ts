import { NextRequest } from "next/server";
import { requireAgentSession } from "@/lib/agentAuth";
import { bundles } from "@/lib/bundles";
import { supabase } from "@/lib/supabase";
import { sendAgentNotification } from "@/lib/telegram";

async function authorize(request: NextRequest, masterAgentId: string, targetAgentId: string) {
  const auth = requireAgentSession(request, masterAgentId, { requireFull: true });
  if (!auth.ok) return { response: Response.json({ error: auth.error }, { status: auth.status }) };
  const { data: master } = await supabase.from("sub_admins").select("id").eq("agent_id", masterAgentId).eq("status", "active").maybeSingle();
  if (!master) return { response: Response.json({ error: "Sub-admin access is not active." }, { status: 403 }) };
  const { data: target } = await supabase.from("agents").select("id,name,telegram_chat_id").eq("id", targetAgentId).eq("sub_admin_id", master.id).maybeSingle();
  if (!target) return { response: Response.json({ error: "This agent is not assigned to your team." }, { status: 403 }) };
  return { master, target };
}

export async function GET(request: NextRequest) {
  const masterAgentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const targetAgentId = request.nextUrl.searchParams.get("targetAgentId") ?? "";
  const access = await authorize(request, masterAgentId, targetAgentId);
  if (access.response) return access.response;
  const [{ data: overrides }, { data: custom }, { data: vouchers }] = await Promise.all([
    supabase.from("bundle_prices").select("id,price,active"),
    supabase.from("agent_bundle_prices").select("bundle_id,custom_price,active,locked_by_sub_admin_id,locked_at").eq("agent_id", targetAgentId),
    supabase.from("agent_voucher_prices").select("voucher_type,sell_price,locked_by_sub_admin_id,locked_at").eq("agent_id", targetAgentId),
  ]);
  const overrideMap = new Map((overrides ?? []).map(row => [row.id, row]));
  const baseBundles = bundles.filter(bundle => overrideMap.get(bundle.id)?.active !== false).map(bundle => ({ id: bundle.id, network: bundle.network, size: bundle.size, basePrice: Number(overrideMap.get(bundle.id)?.price ?? bundle.price) }));
  return Response.json({ target: access.target, bundles: baseBundles, prices: custom ?? [], vouchers: vouchers ?? [], voucherWholesale: 17 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { agentId?: string; targetAgentId?: string; kind?: "bundle" | "voucher" | "bulk"; bundleId?: string; voucherType?: string; price?: number; markup?: number; action?: "set" | "unlock" };
  const access = await authorize(request, body.agentId ?? "", body.targetAgentId ?? "");
  if (access.response) return access.response;
  if (body.kind === "bulk") {
    const markup = Math.round(Number(body.markup) * 100) / 100;
    if (!Number.isFinite(markup) || markup < 0) return Response.json({ error: "Markup must be zero or more." }, { status: 400 });
    const { data: overrides } = await supabase.from("bundle_prices").select("id,price,active");
    const overrideMap = new Map((overrides ?? []).map(row => [row.id, row]));
    const now = new Date().toISOString();
    const rows = bundles.filter(bundle => overrideMap.get(bundle.id)?.active !== false).map(bundle => ({ agent_id: body.targetAgentId!, bundle_id: bundle.id, custom_price: Math.round((Number(overrideMap.get(bundle.id)?.price ?? bundle.price) + markup) * 100) / 100, active: true, locked_by_sub_admin_id: access.master!.id, locked_at: now, updated_at: now }));
    const { error } = await supabase.from("agent_bundle_prices").upsert(rows, { onConflict: "agent_id,bundle_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from("agent_price_history").insert(rows.map(row => ({ target_agent_id: body.targetAgentId!, sub_admin_id: access.master!.id, actor_type: "sub_admin", price_kind: "bundle", item_key: row.bundle_id, new_price: row.custom_price, action: "set_and_lock" })));
    if (access.target?.telegram_chat_id) void sendAgentNotification(access.target.telegram_chat_id, `Your Pro sub-admin applied a GH₵${markup.toFixed(2)} markup and locked all your bundle prices.`);
    return Response.json({ success: true, updated: rows.length });
  }
  const itemKey = body.kind === "voucher" ? String(body.voucherType ?? "").toUpperCase() : String(body.bundleId ?? "");
  const table = body.kind === "voucher" ? "agent_voucher_prices" : "agent_bundle_prices";
  const keyColumn = body.kind === "voucher" ? "voucher_type" : "bundle_id";
  const priceColumn = body.kind === "voucher" ? "sell_price" : "custom_price";
  if (body.action === "unlock") {
    const { data: current } = await supabase.from(table).select(`${priceColumn},locked_by_sub_admin_id`)
      .eq("agent_id", body.targetAgentId!).eq(keyColumn, itemKey).maybeSingle();
    if (current?.locked_by_sub_admin_id !== access.master!.id) return Response.json({ error: "This price is not locked by you." }, { status: 409 });
    const { error } = await supabase.from(table).update({ locked_by_sub_admin_id: null, locked_at: null }).eq("agent_id", body.targetAgentId!).eq(keyColumn, itemKey);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const unlockedPrice = body.kind === "voucher"
      ? Number((current as { sell_price?: number } | null)?.sell_price)
      : Number((current as { custom_price?: number } | null)?.custom_price);
    await supabase.from("agent_price_history").insert({ target_agent_id: body.targetAgentId, sub_admin_id: access.master!.id, actor_type: "sub_admin", price_kind: body.kind, item_key: itemKey, old_price: unlockedPrice, new_price: unlockedPrice, action: "unlock" });
    if (access.target?.telegram_chat_id) void sendAgentNotification(access.target.telegram_chat_id, `Your ${body.kind} price for ${itemKey} was unlocked by your Pro sub-admin.`);
    return Response.json({ success: true, unlocked: true });
  }
  const price = Math.round(Number(body.price) * 100) / 100;
  if (!Number.isFinite(price)) return Response.json({ error: "Enter a valid price." }, { status: 400 });
  if (body.kind === "voucher") {
    const voucherType = String(body.voucherType ?? "").toUpperCase();
    if (!["BECE", "WASSCE"].includes(voucherType) || price < 17) return Response.json({ error: "Voucher price must be at least GH₵17." }, { status: 400 });
    const { data: current } = await supabase.from("agent_voucher_prices").select("sell_price").eq("agent_id", body.targetAgentId!).eq("voucher_type", voucherType).maybeSingle();
    const { error } = await supabase.from("agent_voucher_prices").upsert({ agent_id: body.targetAgentId, voucher_type: voucherType, sell_price: price, active: true, locked_by_sub_admin_id: access.master!.id, locked_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "agent_id,voucher_type" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from("agent_price_history").insert({ target_agent_id: body.targetAgentId, sub_admin_id: access.master!.id, actor_type: "sub_admin", price_kind: "voucher", item_key: voucherType, old_price: current?.sell_price ?? null, new_price: price, action: "set_and_lock" });
  } else {
    const base = bundles.find(bundle => bundle.id === body.bundleId);
    const { data: override } = await supabase.from("bundle_prices").select("price").eq("id", body.bundleId ?? "").maybeSingle();
    const minimum = Number(override?.price ?? base?.price ?? NaN);
    if (!body.bundleId || !Number.isFinite(minimum) || price < minimum) return Response.json({ error: `Selling price must be at least GH₵${Number.isFinite(minimum) ? minimum.toFixed(2) : "0.00"}.` }, { status: 400 });
    const { data: current } = await supabase.from("agent_bundle_prices").select("custom_price").eq("agent_id", body.targetAgentId!).eq("bundle_id", body.bundleId).maybeSingle();
    const { error } = await supabase.from("agent_bundle_prices").upsert({ agent_id: body.targetAgentId, bundle_id: body.bundleId, custom_price: price, active: true, locked_by_sub_admin_id: access.master!.id, locked_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "agent_id,bundle_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await supabase.from("agent_price_history").insert({ target_agent_id: body.targetAgentId, sub_admin_id: access.master!.id, actor_type: "sub_admin", price_kind: "bundle", item_key: body.bundleId, old_price: current?.custom_price ?? null, new_price: price, action: "set_and_lock" });
  }
  await supabase.from("sub_admin_activity").insert({ sub_admin_id: access.master!.id, action: "agent_price_updated", target: body.targetAgentId, details: { kind: body.kind, bundle_id: body.bundleId, voucher_type: body.voucherType, price } });
  if (access.target?.telegram_chat_id) void sendAgentNotification(access.target.telegram_chat_id, `Your Pro sub-admin set and locked your ${body.kind} price for ${itemKey} at GH₵${price.toFixed(2)}.`);
  return Response.json({ success: true });
}
