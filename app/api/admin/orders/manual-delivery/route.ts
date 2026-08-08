import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { sendStuckOrderAlert, retryKeyboard } from "@/lib/telegram";
import { sendAdminWhatsApp } from "@/lib/whatsapp";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

// POST { references: string[] }
// Re-marks failed orders as "processing" and alerts admin for manual delivery.
// Used for orders blocked by Inventor's "beneficiary list" restriction.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { references } = (await request.json()) as { references: string[] };
  if (!Array.isArray(references) || references.length === 0) {
    return Response.json({ error: "references array required" }, { status: 400 });
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("reference, status, phone, network, bundle_size, amount, customer_name, agent_id")
    .in("reference", references);

  if (!orders?.length) return Response.json({ error: "No orders found" }, { status: 404 });

  const results: { ref: string; ok: boolean; note?: string }[] = [];

  for (const order of orders) {
    await supabase.from("orders").update({ status: "processing" }).eq("reference", order.reference);
    results.push({ ref: order.reference, ok: true, note: "marked processing" });
  }

  // Send one batch Telegram alert with all orders
  const lines = orders.map(o =>
    `📱 <code>${o.phone}</code> — ${(o.network ?? "").toUpperCase()} ${o.bundle_size} (GH₵${Number(o.amount).toFixed(2)}) — Ref: <code>${o.reference}</code>`
  ).join("\n");

  const batchAlert =
    `🔴 <b>MANUAL DELIVERY NEEDED — ${orders.length} ORDER(S)</b>\n\n` +
    `These orders were blocked by Inventor (beneficiary list). Send data manually via Inventor dashboard for each number:\n\n` +
    lines +
    `\n\n➡️ After sending each one, mark it completed in the admin panel.`;

  await sendStuckOrderAlert(batchAlert, retryKeyboard(orders[0].reference));

  // WhatsApp plain-text version
  const waLines = orders.map(o =>
    `• ${o.phone} — ${(o.network ?? "").toUpperCase()} ${o.bundle_size} | Ref: ${o.reference}`
  ).join("\n");
  sendAdminWhatsApp(
    `🔴 MANUAL DELIVERY NEEDED — ${orders.length} ORDER(S)\n\n` +
    `Send data manually via Inventor dashboard:\n\n${waLines}\n\nMark each completed in admin panel.`
  ).catch(() => {});

  return Response.json({ queued: results.length, total: references.length, results });
}
