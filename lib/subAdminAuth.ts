import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

export const SUB_ADMIN_COOKIE = "sub_admin_session";
const SESSION_SECONDS = 60 * 60 * 8;

export type SubAdminSession = {
  id: string;
  name: string;
  email: string;
  canApproveOrders: boolean;
  permissions: SubAdminPermissions;
  agentId: string;
};

export type SubAdminPermissions = {
  view_agents: boolean; view_orders: boolean; view_finance: boolean;
  view_customer_contacts: boolean; approve_orders: boolean; download_reports: boolean;
};
export const DEFAULT_SUB_ADMIN_PERMISSIONS: SubAdminPermissions = {
  view_agents: true, view_orders: true, view_finance: false,
  view_customer_contacts: true, approve_orders: false, download_reports: false,
};
function permissions(value: unknown, legacyApproval = false): SubAdminPermissions {
  const raw = value && typeof value === "object" ? value as Partial<SubAdminPermissions> : {};
  return { ...DEFAULT_SUB_ADMIN_PERMISSIONS, ...raw, approve_orders: raw.approve_orders ?? legacyApproval };
}
async function isApprovedProAgent(agentId: string | null | undefined): Promise<boolean> {
  if (!agentId) return false;
  const { data } = await supabase.from("agents").select("id").eq("id", agentId).eq("status", "approved").eq("plan", "pro").maybeSingle();
  return Boolean(data);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authenticateSubAdmin(email: string, password: string): Promise<SubAdminSession | null> {
  const { data } = await supabase
    .from("sub_admins")
    .select("id,name,email,password_hash,status,can_approve_orders,permissions,agent_id")
    .ilike("email", email.trim())
    .maybeSingle();
  if (!data || data.status !== "active" || !(await isApprovedProAgent(data.agent_id)) || !(await bcrypt.compare(password, data.password_hash))) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    canApproveOrders: permissions(data.permissions, Boolean(data.can_approve_orders)).approve_orders,
    permissions: permissions(data.permissions, Boolean(data.can_approve_orders)),
    agentId: data.agent_id,
  };
}

export async function issueSubAdminSession(subAdminId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await supabase.from("sub_admins").update({
    session_hash: hash(token),
    session_expires_at: expiresAt,
    last_login_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", subAdminId);
  const store = await cookies();
  store.set(SUB_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function getSubAdminSession(): Promise<SubAdminSession | null> {
  const token = (await cookies()).get(SUB_ADMIN_COOKIE)?.value;
  if (!token) return null;
  const { data } = await supabase
    .from("sub_admins")
    .select("id,name,email,status,can_approve_orders,permissions,agent_id,session_hash,session_expires_at")
    .eq("session_hash", hash(token))
    .maybeSingle();
  if (!data || data.status !== "active" || !(await isApprovedProAgent(data.agent_id)) || !data.session_hash || !safeEqual(hash(token), data.session_hash)) return null;
  if (!data.session_expires_at || new Date(data.session_expires_at).getTime() <= Date.now()) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    canApproveOrders: permissions(data.permissions, Boolean(data.can_approve_orders)).approve_orders,
    permissions: permissions(data.permissions, Boolean(data.can_approve_orders)),
    agentId: data.agent_id,
  };
}

export async function clearSubAdminSession(): Promise<void> {
  const session = await getSubAdminSession();
  if (session) {
    await supabase.from("sub_admins").update({
      session_hash: null,
      session_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);
  }
  (await cookies()).delete(SUB_ADMIN_COOKIE);
}
