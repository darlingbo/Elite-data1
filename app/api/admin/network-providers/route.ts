import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

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

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [datifyOverride, datifyStart, datifyEnd] = await Promise.all([
    getSetting("datify_override"),
    getSetting("datify_start_time"),
    getSetting("datify_end_time"),
  ]);

  // Get Inventor balance
  let inventorBalance: number | null = null;
  try {
    const r = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      cache: "no-store",
    });
    if (r.ok) {
      const d = await r.json();
      const raw = d?.balance ?? d?.data?.balance ?? d?.wallet_balance ?? d?.data?.wallet_balance ?? null;
      inventorBalance = raw !== null ? Number(raw) : null;
    }
  } catch { /* unreachable */ }

  // Check if currently in Datify time window
  const startTime = datifyStart ?? "18:40";
  const endTime = datifyEnd ?? "09:00";
  const now = new Date();
  const ghTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Accra" }));
  const h = ghTime.getHours(), m = ghTime.getMinutes();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const nowMins = h * 60 + m, startMins = sh * 60 + sm, endMins = eh * 60 + em;
  const inWindow = startMins > endMins
    ? nowMins >= startMins || nowMins < endMins
    : nowMins >= startMins && nowMins < endMins;

  const override = datifyOverride === "1";
  const datifyActive = override || inWindow;

  return Response.json({
    inventorBalance,
    datifyOverride: override,
    datifyStartTime: startTime,
    datifyEndTime: endTime,
    inWindow,
    datifyActive,
    activeProvider: datifyActive ? "datify" : "inventor",
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const ops: Promise<void>[] = [];
  if ("datifyOverride" in body) ops.push(setSetting("datify_override", body.datifyOverride ? "1" : "0"));
  if ("datifyStartTime" in body) ops.push(setSetting("datify_start_time", body.datifyStartTime));
  if ("datifyEndTime" in body) ops.push(setSetting("datify_end_time", body.datifyEndTime));
  await Promise.all(ops);
  return Response.json({ success: true });
}
