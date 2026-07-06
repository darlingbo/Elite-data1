import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) return Response.json({ blocked: false });

  // Check if this number has ever been blocked by Inventor's beneficiary list
  const { data } = await supabase
    .from("orders")
    .select("reference, status, network, bundle_size, created_at")
    .eq("phone", phone)
    .eq("status", "not_on_list")
    .order("created_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const last = data[0];
    return Response.json({
      blocked: true,
      last_network: last.network,
      last_bundle: last.bundle_size,
      last_date: last.created_at,
    });
  }

  return Response.json({ blocked: false });
}
