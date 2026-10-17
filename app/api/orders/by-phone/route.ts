import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { tooMany } from "@/lib/public-limit";

export async function GET(request: NextRequest) {
  const blocked = await tooMany(request, "track-phone", 10, 600000);
  if (blocked) return blocked;

  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) return Response.json({ error: "phone required" }, { status: 400 });

  const { data: orders } = await supabase
    .from("orders")
    .select("reference, status, network, bundle_size, amount, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  return Response.json({ success: true, orders: orders ?? [] });
}
