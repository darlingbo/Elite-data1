import { supabase } from "@/lib/supabase";

export async function auditLog(
  action: string,
  details: Record<string, unknown>,
  ip?: string
): Promise<void> {
  await supabase.from("audit_log").insert({
    action,
    ip: ip ?? null,
    details,
    created_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {});
}
