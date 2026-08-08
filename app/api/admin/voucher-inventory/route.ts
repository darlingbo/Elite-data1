import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("voucher_inventory")
    .select("id, voucher_type, code, status, order_reference, created_at, sent_at")
    .order("id", { ascending: false })
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const counts = { BECE: { available: 0, assigned: 0, sent: 0 }, WASSCE: { available: 0, assigned: 0, sent: 0 } };
  const { data: countRows } = await supabase.from("voucher_inventory").select("voucher_type, status");
  for (const row of countRows ?? []) {
    const type = row.voucher_type as keyof typeof counts;
    const status = row.status as keyof (typeof counts)["BECE"];
    if (counts[type] && status in counts[type]) counts[type][status] += 1;
  }
  return Response.json({ items: data ?? [], counts });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { voucherType?: string; codes?: string };
  const voucherType = body.voucherType?.toUpperCase();
  if (voucherType !== "BECE" && voucherType !== "WASSCE") {
    return Response.json({ error: "Choose BECE or WASSCE" }, { status: 400 });
  }
  const codes = [...new Set(String(body.codes ?? "").split(/\r?\n/).map(code => code.trim()).filter(Boolean))];
  if (codes.length === 0) return Response.json({ error: "Paste at least one voucher" }, { status: 400 });
  if (codes.length > 500) return Response.json({ error: "Add at most 500 vouchers at a time" }, { status: 400 });
  if (codes.some(code => code.length > 300)) return Response.json({ error: "A voucher line is too long" }, { status: 400 });

  const { data, error } = await supabase
    .from("voucher_inventory")
    .upsert(codes.map(code => ({ voucher_type: voucherType, code })), {
      onConflict: "voucher_type,code",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, added: data?.length ?? 0, skipped: codes.length - (data?.length ?? 0) });
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { id?: number };
  if (!Number.isInteger(body.id)) return Response.json({ error: "Invalid voucher" }, { status: 400 });
  const { data, error } = await supabase
    .from("voucher_inventory")
    .delete()
    .eq("id", body.id)
    .eq("status", "available")
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Only unused vouchers can be removed" }, { status: 409 });
  return Response.json({ success: true });
}
