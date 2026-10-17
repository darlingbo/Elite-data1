import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

type Row = {
  status: string;
  amount: number | null;
  admin_commission: number | null;
  network: string | null;
  bundle_size: string | null;
  created_at: string;
  completed_at: string | null;
  reference: string;
  phone: string | null;
  refunded: boolean | null;
};

// Orders that were paid for and are still standing (delivered, on their way, or waiting).
// Failed, rejected and refunded orders are money that goes back, so they are not sales.
const NOT_SALES = new Set(["failed", "rejected", "refunded", "duplicate_blocked", "fraud"]);
const DAY = 86_400_000;
const PAGE = 1000;
const MAX_PAGES = 8;

function cleanSize(raw: string | null): string {
  return String(raw ?? "").replace(/^(mtn|telecel|at ishare|airteltigo|airtel)\s+/i, "").trim();
}

/** The numbers behind the admin Today page, worked out on the server over the last 8 days. */
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  // Ghana is on GMT all year, so UTC days are Ghana days.
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(startOfToday - 7 * DAY).toISOString();

  const rows: Row[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await supabase
      .from("orders")
      .select("status, amount, admin_commission, network, bundle_size, created_at, completed_at, reference, phone, refunded")
      .gte("created_at", since)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) return Response.json({ error: "DB error: " + error.message }, { status: 500 });
    const batch = (data as Row[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const isSale = (r: Row) => !NOT_SALES.has(String(r.status ?? "").toLowerCase());
  const amountOf = (r: Row) => Number(r.amount ?? 0) || 0;
  const t = (r: Row) => new Date(r.created_at).getTime();

  const todayRows = rows.filter((r) => t(r) >= startOfToday);
  const yesterdayRows = rows.filter((r) => t(r) >= startOfToday - DAY && t(r) < startOfToday);

  const salesToday = todayRows.filter(isSale).reduce((s, r) => s + amountOf(r), 0);
  const delivered = todayRows.filter((r) => r.status.toLowerCase() === "completed");
  const today = {
    sales: round2(salesToday),
    orders: todayRows.length,
    delivered: delivered.length,
    profit: round2(delivered.reduce((s, r) => s + Number(r.admin_commission ?? 0), 0)),
  };

  // Cumulative sales at the end of every hour, for today (up to now) and yesterday (all day).
  const nowMs = now.getTime();
  const nowHourFraction = (nowMs - startOfToday) / 3_600_000;
  const cumulative = (list: Row[], dayStart: number, upToHours: number) => {
    const out: number[] = [];
    for (let h = 0; h <= 24; h++) {
      const edge = Math.min(h, upToHours);
      const limit = dayStart + edge * 3_600_000;
      out.push(round2(list.filter(isSale).filter((r) => t(r) < limit).reduce((s, r) => s + amountOf(r), 0)));
    }
    return out;
  };
  const todayCum = cumulative(todayRows, startOfToday, nowHourFraction);
  const yesterdayCum = cumulative(yesterdayRows, startOfToday - DAY, 24);
  const yesterdaySameTime = round2(
    yesterdayRows.filter(isSale).filter((r) => t(r) < startOfToday - DAY + (nowMs - startOfToday)).reduce((s, r) => s + amountOf(r), 0),
  );
  const vsYesterdayPct = yesterdaySameTime > 0 ? Math.round(((salesToday - yesterdaySameTime) / yesterdaySameTime) * 100) : null;

  // Last seven days, oldest first, today last.
  const week: Array<{ label: string; revenue: number; orders: number; isToday: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const start = startOfToday - i * DAY;
    const dayRows = rows.filter((r) => t(r) >= start && t(r) < start + DAY);
    week.push({
      label: new Date(start).toLocaleDateString("en-GH", { weekday: "short", timeZone: "UTC" }),
      revenue: round2(dayRows.filter(isSale).reduce((s, r) => s + amountOf(r), 0)),
      orders: dayRows.length,
      isToday: i === 0,
    });
  }
  const weekRevenue = round2(week.reduce((s, d) => s + d.revenue, 0));
  const weekOrders = week.reduce((s, d) => s + d.orders, 0);

  // Today's sales by network, and the best-selling bundles.
  const byNet = new Map<string, number>();
  const byBundle = new Map<string, { label: string; count: number }>();
  for (const r of todayRows.filter(isSale)) {
    const net = String(r.network ?? "other").toLowerCase();
    byNet.set(net, (byNet.get(net) ?? 0) + amountOf(r));
    const label = `${net === "airteltigo" ? "AirtelTigo" : net.toUpperCase() === "MTN" ? "MTN" : net.charAt(0).toUpperCase() + net.slice(1)} ${cleanSize(r.bundle_size)}`.trim();
    const cur = byBundle.get(label) ?? { label, count: 0 };
    cur.count += 1;
    byBundle.set(label, cur);
  }
  const networks = [...byNet.entries()].map(([net, revenue]) => ({ net, revenue: round2(revenue) })).sort((a, b) => b.revenue - a.revenue);
  const topBundles = [...byBundle.values()].sort((a, b) => b.count - a.count).slice(0, 4);

  const latest = rows.slice(0, 6).map((r) => ({
    reference: r.reference,
    label: `${String(r.network ?? "").toUpperCase()} ${cleanSize(r.bundle_size)}`.trim(),
    phone: r.phone,
    status: r.status,
    amount: amountOf(r),
    created_at: r.created_at,
  }));

  const waiting = rows.filter((r) => r.status === "pending_approval").length;
  const stuck = rows.filter((r) => r.status === "processing" && nowMs - t(r) > 10 * 60_000).length;
  const failed = rows.filter((r) => r.status === "failed" && !r.refunded).length;

  let blockedToday = 0;
  try {
    const { data } = await supabase
      .from("audit_log")
      .select("details")
      .eq("action", "number_check_blocked")
      .gte("created_at", new Date(startOfToday).toISOString())
      .limit(500);
    blockedToday = new Set(((data as Array<{ details: { phone?: string } | null }> | null) ?? []).map((d) => d.details?.phone).filter(Boolean)).size;
  } catch { /* the audit table is optional */ }

  return Response.json({
    generatedAt: now.toISOString(),
    nowHour: nowHourFraction,
    today,
    vsYesterdayPct,
    hourly: { today: todayCum, yesterday: yesterdayCum },
    week,
    weekTotals: { revenue: weekRevenue, orders: weekOrders, average: weekOrders > 0 ? round2(weekRevenue / weekOrders) : 0 },
    networks,
    topBundles,
    latest,
    attention: { waiting, stuck, failed, blockedToday },
  });
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
