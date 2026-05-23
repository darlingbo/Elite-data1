import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("target") ?? "customers";
  const now = new Date().toISOString();

  // Agent-type-specific targets also receive "agents" (all-agents) announcements
  let orParts = `target.eq.all,target.eq.${target}`;
  if (target === "agents_commission" || target === "agents_custom_price") {
    orParts += ",target.eq.agents";
  }

  const { data, error } = await supabase
    .from("announcements")
    .select("id, message, target, expires_at, show_from_hour, show_to_hour, created_at")
    .eq("active", true)
    .or(orParts)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ announcements: [] });

  // Filter by active hours (Ghana = UTC+0, no DST)
  const ghanaHour = new Date().getUTCHours();
  const filtered = (data ?? []).filter((a) => {
    const from = a.show_from_hour;
    const to = a.show_to_hour;
    if (from === null || from === undefined) return true; // always show
    if (from < to) return ghanaHour >= from && ghanaHour < to;
    return ghanaHour >= from || ghanaHour < to; // crosses midnight (e.g. 18→6)
  });

  return Response.json({ announcements: filtered });
}
