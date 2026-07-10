import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

async function getInventorStatus(reference: string): Promise<{
  status: string | null;
  inventorStatus: string | null;
  inventorMessage: string | null;
}> {
  try {
    const res = await fetch(
      `${process.env.INVENTOR_API_BASE_URL}/api/developer/orders/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
        signal: AbortSignal.timeout(8000),
      }
    );
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;

    // Try multiple response shapes
    const inv =
      (body.data as Record<string, unknown>) ??
      (body.order as Record<string, unknown>) ??
      body;

    const rawStatus =
      (inv.status as string) ??
      (inv.delivery_status as string) ??
      (body.status as string) ??
      null;

    if (!rawStatus) return { status: null, inventorStatus: null, inventorMessage: null };

    const s = String(rawStatus).toLowerCase();
    // Map Inventor status → our normalised status
    let mapped: string;
    if (s.includes("complet") || s.includes("success") || s.includes("deliver")) mapped = "completed";
    else if (s.includes("fail") || s.includes("error") || s.includes("cancel")) mapped = "failed";
    else if (s.includes("process") || s.includes("progress") || s.includes("dispatch")) mapped = "processing";
    else mapped = "pending";

    const message =
      (inv.message as string) ??
      (body.message as string) ??
      rawStatus;

    return { status: mapped, inventorStatus: rawStatus, inventorMessage: message };
  } catch {
    return { status: null, inventorStatus: null, inventorMessage: null };
  }
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/orders/[reference]">
) {
  const { reference } = await ctx.params;

  // Fetch DB order + Inventor live status in parallel
  const [dbResult, inventorResult] = await Promise.all([
    supabase
      .from("orders")
      .select("reference, status, customer_name, phone, network, bundle_size, amount, created_at")
      .eq("reference", reference)
      .maybeSingle(),
    getInventorStatus(reference),
  ]);

  let data: Record<string, unknown> | null = null;

  if (!dbResult.error && dbResult.data) {
    data = dbResult.data as Record<string, unknown>;
  } else {
    // Fallback: minimal columns
    const minimal = await supabase
      .from("orders")
      .select("reference, status, phone, amount, created_at")
      .eq("reference", reference)
      .maybeSingle();
    if (!minimal.error && minimal.data) data = minimal.data as Record<string, unknown>;
  }

  if (!data) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  // Prefer Inventor live status if available (more up-to-date)
  const finalStatus = inventorResult.status ?? (data.status as string) ?? "pending";

  // Sync DB whenever Inventor has a newer/better status
  const dbStatus = (data.status as string) ?? "";
  const shouldSync =
    inventorResult.status &&
    inventorResult.status !== dbStatus &&
    (
      inventorResult.status === "completed" ||
      (inventorResult.status === "processing" && dbStatus === "pending") ||
      (inventorResult.status === "failed" && (dbStatus === "pending" || dbStatus === "processing"))
    );

  if (shouldSync) {
    supabase.from("orders").update({ status: inventorResult.status }).eq("reference", reference).then(() => {});
  }

  return Response.json({
    success: true,
    order: {
      ...data,
      status: finalStatus,
      inventor_status: inventorResult.inventorStatus,
      inventor_message: inventorResult.inventorMessage,
    },
  });
}
