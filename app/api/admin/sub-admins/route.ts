import bcrypt from "bcryptjs";
import { isAdmin } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { DEFAULT_SUB_ADMIN_PERMISSIONS, type SubAdminPermissions } from "@/lib/subAdminAuth";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [subAdmins, agents] = await Promise.all([
    supabase.from("sub_admins")
      .select("id,name,email,status,can_approve_orders,permissions,agent_id,master_commission_rate,last_login_at,created_at")
      .order("created_at", { ascending: false }),
    supabase.from("agents")
      .select("id,name,email,referral_code,status,plan,sub_admin_id")
      .order("name"),
  ]);
  if (subAdmins.error) return Response.json({ error: subAdmins.error.message }, { status: 500 });
  if (agents.error) return Response.json({ error: agents.error.message }, { status: 500 });
  return Response.json({ subAdmins: subAdmins.data ?? [], agents: agents.data ?? [] });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    agentId?: string; password?: string; permissions?: Partial<SubAdminPermissions>; masterCommissionRate?: number;
  } | null;
  const { data: proAgent } = body?.agentId ? await supabase.from("agents").select("id,name,email,status,plan").eq("id", body.agentId).maybeSingle() : { data: null };
  if (!proAgent || proAgent.status !== "approved" || proAgent.plan !== "pro") return Response.json({ error: "Select an approved Pro agent." }, { status: 400 });
  const name = proAgent.name.trim();
  const email = proAgent.email.trim().toLowerCase();
  const password = body?.password ?? "";
  if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const permissions = { ...DEFAULT_SUB_ADMIN_PERMISSIONS, ...(body?.permissions ?? {}) };
  const { data, error } = await supabase.from("sub_admins").insert({
    name,
    email,
    agent_id: proAgent.id,
    password_hash: await bcrypt.hash(password, 12),
    can_approve_orders: permissions.approve_orders,
    permissions,
    master_commission_rate: Math.min(100, Math.max(0, Number(body?.masterCommissionRate ?? 0))),
  }).select("id,name,email,status,can_approve_orders,permissions,agent_id,master_commission_rate,created_at").single();
  if (error) {
    return Response.json(
      { error: error.code === "23505" ? "A sub-admin with this email already exists." : error.message },
      { status: error.code === "23505" ? 409 : 500 },
    );
  }
  return Response.json({ success: true, subAdmin: data });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    id?: string;
    status?: "active" | "disabled";
    canApproveOrders?: boolean;
    password?: string;
    agentIds?: string[];
    permissions?: Partial<SubAdminPermissions>;
    masterCommissionRate?: number;
  } | null;
  if (!body?.id) return Response.json({ error: "Sub-admin ID is required." }, { status: 400 });

  if (Array.isArray(body.agentIds)) {
    const uniqueAgentIds = [...new Set(body.agentIds.filter(Boolean))];
    const { data: master } = await supabase.from("sub_admins").select("agent_id").eq("id", body.id).single();
    if (master?.agent_id && uniqueAgentIds.includes(master.agent_id)) return Response.json({ error: "A Master Agent cannot be assigned under themselves." }, { status: 400 });
    if (uniqueAgentIds.length) {
      const { data: otherMasters } = await supabase.from("sub_admins").select("agent_id").in("agent_id", uniqueAgentIds);
      if ((otherMasters ?? []).length) return Response.json({ error: "A Master Agent cannot also be assigned as a sub-agent." }, { status: 400 });
    }
    const clear = await supabase.from("agents").update({ sub_admin_id: null }).eq("sub_admin_id", body.id);
    if (clear.error) return Response.json({ error: clear.error.message }, { status: 500 });
    if (uniqueAgentIds.length) {
      const assign = await supabase.from("agents").update({ sub_admin_id: body.id }).in("id", uniqueAgentIds);
      if (assign.error) return Response.json({ error: assign.error.message }, { status: 500 });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) patch.status = body.status;
  if (typeof body.canApproveOrders === "boolean") patch.can_approve_orders = body.canApproveOrders;
  if (body.permissions) {
    const permissions = { ...DEFAULT_SUB_ADMIN_PERMISSIONS, ...body.permissions };
    patch.permissions = permissions;
    patch.can_approve_orders = permissions.approve_orders;
  }
  if (body.masterCommissionRate !== undefined) patch.master_commission_rate = Math.min(100, Math.max(0, Number(body.masterCommissionRate)));
  if (body.password !== undefined) {
    if (body.password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    patch.password_hash = await bcrypt.hash(body.password, 12);
    patch.session_hash = null;
    patch.session_expires_at = null;
  }
  if (Object.keys(patch).length > 1) {
    const { error } = await supabase.from("sub_admins").update(patch).eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true });
}
