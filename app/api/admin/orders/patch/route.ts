import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { orderRefundedSMS, sendCustomerSMS } from "@/lib/sms";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
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
    refunded?: boolean;
  };

  const { reference, agentId, costPrice, agentCommission, adminCommission, bundleSize, status, creditAgent } = body;
  if (!reference) return Response.json({ error: "reference required" }, { status: 400 });
  if (creditAgent) {
    return Response.json({
      error: "Direct commission credit is disabled. Complete the order through the approval controls.",
    }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (agentId !== undefined)          patch.agent_id = agentId;
  if (costPrice !== undefined)        patch.cost_price = costPrice;
  if (agentCommission !== undefined)  patch.agent_commission = agentCommission;
  if (adminCommission !== undefined)  patch.admin_commission = adminCommission;
  if (bundleSize !== undefined)       patch.bundle_size = bundleSize;
  if (status !== undefined)           patch.status = status;
  if (body.refunded !== undefined) {
    patch.refunded = body.refunded;
    if (body.refunded) {
      patch.refunded_at = new Date().toISOString();
      patch.status = "refunded";
    }
  }

  if (Object.keys(patch).length === 0) return Response.json({ error: "No fields to update" }, { status: 400 });

  const { data: before } = await supabase.from("orders")
    .select("status,amount,customer_name,phone,refunded,refunded_at,refund_amount")
    .eq("reference", reference).maybeSingle();
  if (!before) return Response.json({ error: "Order not found" }, { status: 404 });
  if (body.refunded) patch.refund_amount = Number(before.amount ?? 0);
  const { error } = await supabase.from("orders").update(patch).eq("reference", reference);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (body.refunded) {
    sendCustomerSMS(
      String(before.phone ?? ""),
      orderRefundedSMS(String(before.customer_name ?? "Customer"), Number(before.amount ?? 0), reference),
    ).catch(() => {});
    const { error: reversalError } = await supabase.rpc("reverse_team_commission", {
      p_reference: reference,
      p_reason: "manual_refund",
    });
    if (reversalError) return Response.json({ error: reversalError.message }, { status: 500 });
  }

  try {
    await supabase.from("order_logs").insert({
      reference,
      action: "patched",
      note: `Admin updated: ${Object.keys(patch).join(", ")}`,
      details: { before, after: patch },
    });
  } catch { /* non-critical */ }

  return Response.json({ success: true, patched: Object.keys(patch) });
}

// DELETE — remove a single order by reference, or all orders with a given status (e.g. failed)
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { status?: string; reference?: string };

  // Single-order deletion by reference
  if (body.reference) {
    const { reference } = body;
    const { data: order } = await supabase.from("orders").select("status, reference").eq("reference", reference).maybeSingle();
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

    const allowedStatuses = ["failed", "pending", "pending_approval", "processing"];
    if (!allowedStatuses.includes((order.status ?? "").toLowerCase())) {
      return Response.json({ error: `Can only delete orders with status: ${allowedStatuses.join(", ")}` }, { status: 400 });
    }

    const { error } = await supabase.from("orders").update({
      archived_at: new Date().toISOString(),
      archived_reason: "Archived from admin dashboard",
      archived_by: "admin",
    }).eq("reference", reference);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true, archived: 1 });
  }

  // Bulk deletion by status
  const { status } = body;
  if (!status) return Response.json({ error: "status or reference required" }, { status: 400 });

  const allowedStatuses = ["failed", "pending", "processing"];
  if (!allowedStatuses.includes(status)) {
    return Response.json({ error: `Can only delete orders with status: ${allowedStatuses.join(", ")}` }, { status: 400 });
  }

  const { data: toDelete } = await supabase.from("orders").select("reference").eq("status", status);
  const count = toDelete?.length ?? 0;
  if (count === 0) return Response.json({ success: true, deleted: 0 });

  const { error } = await supabase.from("orders").update({
    archived_at: new Date().toISOString(),
    archived_reason: `Bulk archive: ${status}`,
    archived_by: "admin",
  }).eq("status", status).is("archived_at", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, archived: count });
}
