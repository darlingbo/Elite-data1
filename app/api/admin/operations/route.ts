import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

export async function GET() {
  const cookieStore = await cookies();
  if (!(await verifyAdminSessionValue(cookieStore.get("admin_session")?.value))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [pending, stuck, failed, unknown, accounting, audit] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true })
      .eq("status", "pending_approval").is("archived_at", null),
    supabase.from("orders").select("reference,status,phone,amount,created_at")
      .ilike("status", "processing").lt("created_at", thirtyMinutesAgo).is("archived_at", null).limit(50),
    supabase.from("orders").select("*", { count: "exact", head: true })
      .ilike("status", "failed").gte("created_at", dayAgo).is("archived_at", null),
    supabase.from("orders").select("reference,status,phone,amount,created_at")
      .eq("status", "delivery_unknown").is("archived_at", null).limit(50),
    supabase.from("orders").select("reference,status,phone,amount,created_at")
      .ilike("status", "completed").not("agent_id", "is", null)
      .is("agent_accounting_applied_at", null).is("archived_at", null).limit(50),
    supabase.from("audit_log").select("id,action,details,created_at")
      .order("created_at", { ascending: false }).limit(50),
  ]);

  const error = [pending, stuck, failed, unknown, accounting, audit].find((result) => result.error)?.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    counts: {
      pendingApproval: pending.count ?? 0,
      stuckProcessing: stuck.data?.length ?? 0,
      failed24h: failed.count ?? 0,
      deliveryUnknown: unknown.data?.length ?? 0,
      accountingMismatch: accounting.data?.length ?? 0,
    },
    alerts: [...(unknown.data ?? []), ...(accounting.data ?? []), ...(stuck.data ?? [])],
    audit: audit.data ?? [],
    checkedAt: new Date().toISOString(),
  });
}
