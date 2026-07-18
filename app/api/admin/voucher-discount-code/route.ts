import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("system_settings").select("value").eq("key", "voucher_discount_code").maybeSingle();
  return Response.json({ code: data?.value ?? "" });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await request.json().catch(() => ({})) as { code?: string };
  const value = (code ?? "").trim().toUpperCase();

  if (value) {
    await supabase.from("system_settings").upsert(
      { key: "voucher_discount_code", value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  } else {
    await supabase.from("system_settings").delete().eq("key", "voucher_discount_code");
  }

  return Response.json({ success: true, code: value });
}
