import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { datacityBalance } from "@/lib/datacity";
import { datifyBalance } from "@/lib/datify";

async function isAdmin() {
  const s = await cookies();
  return s.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function getSetting(key: string) {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await supabase.from("system_settings").upsert({ key, value }, { onConflict: "key" });
}

async function getInventorBalance(): Promise<number | null> {
  try {
    const r = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const d = await r.json();
    const raw = d?.balance ?? d?.data?.balance ?? d?.wallet_balance ?? d?.data?.wallet_balance ?? null;
    return raw !== null ? Number(raw) : null;
  } catch { return null; }
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [inventorBal, datacityBal, datifyBal, invEnabled, dcEnabled, dtEnabled] = await Promise.all([
    getInventorBalance(),
    datacityBalance(),
    datifyBalance(),
    getSetting("inventor_enabled"),
    getSetting("datacity_enabled"),
    getSetting("datify_enabled"),
  ]);

  return Response.json({
    inventorBalance:  inventorBal,
    datacityBalance:  datacityBal,
    datifyBalance:    datifyBal,
    inventorEnabled:  (invEnabled ?? "1") === "1",
    datacityEnabled:  (dcEnabled  ?? "1") === "1",
    datifyEnabled:    (dtEnabled  ?? "1") === "1",
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const ops: Promise<void>[] = [];
  if ("inventorEnabled" in body) ops.push(setSetting("inventor_enabled", body.inventorEnabled ? "1" : "0"));
  if ("datacityEnabled" in body) ops.push(setSetting("datacity_enabled", body.datacityEnabled ? "1" : "0"));
  if ("datifyEnabled"   in body) ops.push(setSetting("datify_enabled",   body.datifyEnabled   ? "1" : "0"));
  await Promise.all(ops);
  return Response.json({ success: true });
}
