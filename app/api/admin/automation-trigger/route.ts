import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

async function readTrigger() {
  const { data, error } = await supabase
    .from("system_settings")
    .select("key,value,updated_at")
    .in("key", ["new_order_automation_enabled", "new_order_automation_enabled_at"]);

  if (error) throw error;
  const values = Object.fromEntries((data ?? []).map(row => [row.key, row.value]));
  return {
    enabled: values.new_order_automation_enabled === "true",
    enabledAt: values.new_order_automation_enabled_at || null,
  };
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await readTrigger());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read trigger" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { enabled?: boolean } | null;
  if (!body || typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be true or false" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = [
    { key: "new_order_automation_enabled", value: body.enabled ? "true" : "false", updated_at: now },
    { key: "new_order_automation_enabled_at", value: body.enabled ? now : "", updated_at: now },
  ];
  const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    action: body.enabled ? "new_order_automation_enabled" : "new_order_automation_disabled",
    details: {
      applies_to: "orders created after enabled_at only",
      enabled_at: body.enabled ? now : null,
      old_pending_orders_unchanged: true,
      automatic_retry: false,
      automatic_refund: false,
      provider_switching: false,
    },
  }).then(() => undefined, () => undefined);

  return Response.json({ enabled: body.enabled, enabledAt: body.enabled ? now : null });
}
