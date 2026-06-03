import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

// PATCH — fix an order's fields and optionally credit agent commission
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    reference: string;
    agentId?: string;
    costPrice?: number;
    agentCommission?: number;
    adminCommission?: number;
    bundleSize?: string;
    status?: string;
    creditAgent?: boolean;
  };

  const { reference, agentId, costPrice, agentCommission, adminCommission, bundleSize, status, creditAgent } = body;
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (agentId !== undefined)       patch.agent_id = agentId;
  if (costPrice !== undefined)     patch.cost_price = costPrice;
  if (agentCommission !== undefined) patch.agent_commission = agentCommission;
  if (adminCommission !== undefined) patch.admin_commission = adminCommission;
  if (bundleSize !== undefined)    patch.bundle_size = bundleSize;
  if (status !== undefined)        patch.status = status;

  if (Object.keys(patch).length === 0) return Response.json({ error: "No fields to update" }, { status: 400 });

  const { data: before } = await supabase.from("orders").select(Object.keys(patch).join(",")).eq("reference", reference).maybeSingle();
  const { error } = await supabase.from("orders").update(patch).eq("reference", reference);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  try {
    await supabase.from("order_logs").insert({
      reference,
      action: "patched",
      note: `Admin updated: ${Object.keys(patch).join(", ")}`,
      details: { before, after: patch },
    });
  } catch { /* non-critical */ }

  // Credit agent if requested
  if (creditAgent && agentId && agentCommission) {
    const { data: orderAmt } = await supabase.from("orders").select("amount").eq("reference", reference).maybeSingle();
    const revenue = (orderAmt as { amount?: number } | null)?.amount ?? 0;
    const { data: ag } = await supabase.from("agents").select("commission_balance, total_sales, total_revenue").eq("id", agentId).maybeSingle();
    if (ag) {
      await supabase.from("agents").update({
        commission_balance: (Number(ag.commission_balance) || 0) + agentCommission,
        total_sales: (Number(ag.total_sales) || 0) + 1,
        total_revenue: (Number(ag.total_revenue) || 0) + revenue,
        updated_at: new Date().toISOString(),
      }).eq("id", agentId);
    }

    // Log to wallet transactions
    await supabase.from("agent_wallet_transactions").insert({
      agent_id: agentId,
      type: "order_profit",
      amount: agentCommission,
      description: `Commission for ${reference}`,
    });
  }

  return Response.json({ success: true, patched: Object.keys(patch) });
}

// DELETE — remove all orders with a given status (e.g. failed)
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json() as { status: string };
  if (!status) return Response.json({ error: "status required" }, { status: 400 });

  const allowedStatuses = ["failed", "pending", "processing"];
  if (!allowedStatuses.includes(status)) {
    return Response.json({ error: `Can only delete orders with status: ${allowedStatuses.join(", ")}` }, { status: 400 });
  }

  const { data: toDelete } = await supabase.from("orders").select("reference").eq("status", status);
  const count = toDelete?.length ?? 0;
  if (count === 0) return Response.json({ success: true, deleted: 0 });

  const { error } = await supabase.from("orders").delete().eq("status", status);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, deleted: count });
}
