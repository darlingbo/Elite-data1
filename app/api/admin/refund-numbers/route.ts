import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── Source 1: append-only refund log (never disappears) ──────────────────
  const { data: logRow } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "refund_log")
    .maybeSingle();

  let logEntries: Record<string, unknown>[] = [];
  try { logEntries = JSON.parse(logRow?.value ?? "[]"); } catch { logEntries = []; }

  // ── Source 2: orders table (for orders column data like amount/status) ────
  const { data: orders, error } = await supabase
    .from("orders")
    .select("reference, customer_name, phone, refund_phone, refund_network, network, bundle_size, amount, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  // Build a map of order data keyed by reference
  const orderMap = new Map<string, Record<string, unknown>>();
  for (const o of orders ?? []) {
    orderMap.set(o.reference, o);
  }

  // ── Merge: log entries enriched with live order data ─────────────────────
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  // Log entries first (most reliable)
  for (const entry of [...logEntries].reverse()) { // newest first
    const ref = String(entry.reference ?? "");
    if (seen.has(ref)) continue;
    seen.add(ref);
    const order = orderMap.get(ref);
    rows.push({
      reference: ref,
      customer_name: entry.customer_name ?? order?.customer_name ?? null,
      phone: entry.customer_phone ?? order?.phone ?? null,
      refund_name: entry.refund_name ?? null,
      refund_phone: entry.refund_phone ?? order?.refund_phone ?? null,
      refund_network: entry.refund_network ?? order?.refund_network ?? null,
      network: order?.network ?? entry.network ?? null,
      bundle_size: order?.bundle_size ?? entry.bundle_size ?? null,
      amount: order?.amount ?? null,
      status: order?.status ?? null,
      created_at: entry.saved_at ?? order?.created_at ?? null,
    });
  }

  // Also pick up any orders with refund_phone that aren't in the log (legacy)
  if (!error) {
    for (const o of orders ?? []) {
      if (!o.refund_phone || seen.has(o.reference)) continue;
      seen.add(o.reference);
      rows.push({
        reference: o.reference,
        customer_name: o.customer_name,
        phone: o.phone,
        refund_name: null,
        refund_phone: o.refund_phone,
        refund_network: o.refund_network,
        network: o.network,
        bundle_size: o.bundle_size,
        amount: o.amount,
        status: o.status,
        created_at: o.created_at,
      });
    }
  }

  return Response.json({ orders: rows, total: rows.length });
}
