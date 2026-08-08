import { supabase } from "@/lib/supabase";

type ProAgent = {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  plan?: string | null;
  status?: string | null;
  sub_admin_id?: string | null;
};

const DEFAULT_PERMISSIONS = {
  view_agents: true,
  view_orders: true,
  view_finance: false,
  view_customer_contacts: true,
  approve_orders: false,
  download_reports: false,
};

export async function syncProAgentSubAdmin(agent: ProAgent): Promise<string | null> {
  if (agent.plan !== "pro" || agent.status !== "approved" || !agent.password_hash) return null;

  let subAdminId = agent.sub_admin_id ?? null;
  if (!subAdminId) {
    const { data: existing } = await supabase
      .from("sub_admins")
      .select("id")
      .eq("email", agent.email.toLowerCase())
      .maybeSingle();
    subAdminId = existing?.id ?? null;
  }

  if (subAdminId) {
    const { error } = await supabase.from("sub_admins").update({
      name: agent.name,
      email: agent.email.toLowerCase(),
      password_hash: agent.password_hash,
      status: "active",
      agent_id: agent.id,
      master_commission_rate: 20,
      permissions: DEFAULT_PERMISSIONS,
      updated_at: new Date().toISOString(),
    }).eq("id", subAdminId);
    if (error) throw error;
  } else {
    const { data: created, error } = await supabase.from("sub_admins").insert({
      name: agent.name,
      email: agent.email.toLowerCase(),
      password_hash: agent.password_hash,
      status: "active",
      can_approve_orders: false,
      agent_id: agent.id,
      master_commission_rate: 20,
      permissions: DEFAULT_PERMISSIONS,
    }).select("id").single();
    if (error) throw error;
    subAdminId = created.id;
  }

  if (agent.sub_admin_id !== subAdminId) {
    const { error } = await supabase.from("agents").update({ sub_admin_id: subAdminId }).eq("id", agent.id);
    if (error) throw error;
  }
  return subAdminId;
}
