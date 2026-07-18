import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("custom_tier_prices")
    .select("bundle_id, price");

  if (error) return Response.json({ prices: [], tableError: error.message });
  return Response.json({ prices: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { bundleId, price } = await request.json();
  if (!bundleId || typeof price !== "number" || price <= 0) {
    return Response.json({ error: "Invalid input." }, { status: 400 });
  }

  const { error } = await supabase
    .from("custom_tier_prices")
    .upsert({ bundle_id: bundleId, price, updated_at: new Date().toISOString() }, { onConflict: "bundle_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
