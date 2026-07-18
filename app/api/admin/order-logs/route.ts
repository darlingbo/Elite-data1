import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ref = request.nextUrl.searchParams.get("reference");
  if (!ref) return Response.json({ error: "reference is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("order_logs")
    .select("id, action, note, details, created_at")
    .eq("reference", ref)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ logs: data ?? [] });
}

// POST — log an action (called internally by other routes)
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { reference: string; action: string; note?: string; details?: Record<string, unknown> };
  const { reference, action, note, details } = body;
  if (!reference || !action) return Response.json({ error: "reference and action required" }, { status: 400 });

  await supabase.from("order_logs").insert({ reference, action, note, details });
  return Response.json({ success: true });
}
