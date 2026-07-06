import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Try with refund columns first; fall back if columns don't exist yet
  const { data, error } = await supabase
    .from("orders")
    .select("reference, customer_name, phone, refund_phone, refund_network, network, bundle_size, amount, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    // Columns may not exist yet — return empty with migration hint
    return Response.json({
      orders: [],
      migration_needed: true,
      hint: "Run in Supabase SQL editor: ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_phone TEXT; ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_network TEXT;",
    });
  }

  // Only return rows that have a refund phone on file
  const withRefund = (data ?? []).filter(o => o.refund_phone);

  return Response.json({ orders: withRefund, total: withRefund.length });
}
