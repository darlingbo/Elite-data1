import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: orders } = await supabase
    .from("orders")
    .select("phone, customer_name, network, amount, status, created_at")
    .order("created_at", { ascending: false });

  const map: Record<string, { name: string; phone: string; networks: Set<string>; orders: number; spent: number; lastOrder: string }> = {};
  for (const o of orders ?? []) {
    const key = o.phone ?? "unknown";
    if (!map[key]) map[key] = { name: o.customer_name ?? o.phone, phone: key, networks: new Set(), orders: 0, spent: 0, lastOrder: o.created_at };
    map[key].orders++;
    if (o.status?.toLowerCase() === "completed") map[key].spent += Number(o.amount ?? 0);
    if (o.network) map[key].networks.add(o.network.toUpperCase());
    if (o.created_at > map[key].lastOrder) map[key].lastOrder = o.created_at;
  }

  const customers = Object.values(map)
    .sort((a, b) => b.spent - a.spent)
    .map(c => ({ ...c, networks: Array.from(c.networks) }));

  const totalSpent = customers.reduce((s, c) => s + c.spent, 0);
  const avgOrders = customers.length ? customers.reduce((s, c) => s + c.orders, 0) / customers.length : 0;
  const repeatBuyers = customers.filter(c => c.orders > 1).length;

  return Response.json({ customers, totalSpent, avgOrders: Math.round(avgOrders * 10) / 10, repeatBuyers });
}
