import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: txns } = await supabase
    .from("agent_wallet_transactions")
    .select("id, agent_id, type, amount, description, created_at, status")
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false });

  const { data: agents } = await supabase.from("agents").select("id, name, referral_code, phone");
  const agentMap = new Map((agents ?? []).map(a => [a.id, a]));

  const rows = (txns ?? []).map(t => ({
    ...t,
    agent: agentMap.get(t.agent_id) ?? null,
    status: t.status ?? "approved",
  }));

  const pending = rows.filter(r => r.status === "pending").length;
  const approved = rows.filter(r => r.status === "approved").length;
  const rejected = rows.filter(r => r.status === "rejected").length;
  const totalGhc = rows.filter(r => r.status === "approved").reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  return Response.json({ withdrawals: rows, pending, approved, rejected, totalGhc });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = await req.json();
  if (!id || !["approved", "rejected"].includes(status)) return Response.json({ error: "invalid" }, { status: 400 });
  const { error } = await supabase.from("agent_wallet_transactions").update({ status }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
