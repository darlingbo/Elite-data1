import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) return Response.json({ error: "phone required" }, { status: 400 });

  const { data: orders } = await supabase
    .from("orders")
    .select("reference, status, network, bundle_size, amount, created_at, phone")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  return Response.json({ success: true, orders: orders ?? [] });
}
