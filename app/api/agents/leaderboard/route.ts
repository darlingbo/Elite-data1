import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") ?? "all";

  let query = supabase
    .from("agents")
    .select("id, name, referral_code, total_sales, total_revenue")
    .eq("status", "approved")
    .gt("total_sales", 0)
    .order("total_sales", { ascending: false })
    .limit(20);

  if (period === "month") {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    // For monthly we rank by sales, still using the all-time columns as proxy
    // (a future enhancement can query orders grouped by agent for this month)
    query = supabase
      .from("agents")
      .select("id, name, referral_code, total_sales, total_revenue")
      .eq("status", "approved")
      .gt("total_sales", 0)
      .order("total_sales", { ascending: false })
      .limit(20);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ leaders: [] });

  const leaders = (data ?? []).map((a, i) => ({
    rank: i + 1,
    name: a.name ?? "Agent",
    referral_code: a.referral_code ?? "",
    total_sales: a.total_sales ?? 0,
    total_revenue: a.total_revenue ?? 0,
  }));

  return NextResponse.json({ leaders });
}
