import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { clearStoreStatusCache } from "@/lib/store-status";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

async function getKV(key: string): Promise<string | null> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setKV(key: string, value: string) {
  const { error } = await supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  // Surface failures — a swallowed error made the admin button say "CLOSED"
  // while nothing was actually saved.
  if (error) throw new Error(`Could not save ${key}: ${error.message}`);
}

export async function GET() {
  const [openVal, msg, helplineVal, mtnVerifyVal, telecelNoticeVal] = await Promise.all([
    getKV("store_open"),
    getKV("store_closed_message"),
    getKV("helpline_enabled"),
    getKV("mtn_verification_enabled"),
    getKV("telecel_notice_enabled"),
  ]);
  return Response.json({
    open: openVal !== "false",
    closedMessage: msg ?? "",
    helplineEnabled: helplineVal !== "false",
    mtnVerificationEnabled: mtnVerifyVal !== "false",
    // Off unless the admin explicitly turns it on.
    telecelNoticeEnabled: telecelNoticeVal === "true",
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  try {
    if (typeof body.open === "boolean") await setKV("store_open", String(body.open));
    if (typeof body.closedMessage === "string") await setKV("store_closed_message", body.closedMessage);
    if (typeof body.helplineEnabled === "boolean") await setKV("helpline_enabled", String(body.helplineEnabled));
    if (typeof body.mtnVerificationEnabled === "boolean") await setKV("mtn_verification_enabled", String(body.mtnVerificationEnabled));
    if (typeof body.telecelNoticeEnabled === "boolean") await setKV("telecel_notice_enabled", String(body.telecelNoticeEnabled));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not save setting" }, { status: 500 });
  } finally {
    // Make this server instance notice the change immediately.
    clearStoreStatusCache();
  }
  return Response.json({ success: true });
}
