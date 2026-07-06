import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { datacityVerify } from "@/lib/datacity";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  const network = request.nextUrl.searchParams.get("network")?.trim() ?? "";
  if (!phone) return Response.json({ blocked: false });

  // 1. Live verify via DataCity (catches bad numbers before payment)
  if (network) {
    const { verified, error } = await datacityVerify(network, phone);
    if (!verified) {
      return Response.json({
        blocked: true,
        reason: "verify_failed",
        message: error ?? "This number cannot receive data right now.",
      });
    }
  }

  // 2. Fallback: check our own DB for previously blocked numbers
  const { data } = await supabase
    .from("orders")
    .select("reference, status, network, bundle_size, created_at")
    .eq("phone", phone)
    .eq("status", "not_on_list")
    .order("created_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return Response.json({
      blocked: true,
      reason: "not_on_list",
      message: "This number was previously blocked from receiving data.",
    });
  }

  return Response.json({ blocked: false });
}
