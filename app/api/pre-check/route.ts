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

  // 2. Fallback: this number already has an order being delivered manually
  //    (new / not yet on the beneficiary list — can take up to 72 hours).
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
      message: "You already have a recent order for this number that we're delivering manually (up to 72 hours). Please wait for it to complete before ordering again.",
    });
  }

  return Response.json({ blocked: false });
}
