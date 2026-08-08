import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("result_checker_requests").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const references = (data ?? []).map(row => row.order_reference);
  const { data: vouchers } = references.length
    ? await supabase.from("voucher_inventory").select("order_reference,code").in("order_reference", references)
    : { data: [] };
  const codes = new Map((vouchers ?? []).map(row => [row.order_reference, row.code]));
  return Response.json({ requests: (data ?? []).map(row => ({ ...row, voucher_code: codes.get(row.order_reference) ?? null })) });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = String(body.id ?? "");
  const action = body.action === "reopen" ? "reopen" : body.action === "complete" ? "complete" : null;
  if (!id || !action) return Response.json({ error: "Invalid request" }, { status: 400 });
  const changes = action === "complete" ? { status: "completed", completed_at: new Date().toISOString() } : { status: "awaiting_result", completed_at: null };
  const { error } = await supabase.from("result_checker_requests").update(changes).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
