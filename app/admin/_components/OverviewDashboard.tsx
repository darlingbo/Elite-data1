"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StatsData, Tab } from "./shared/types";
import Icon, { type IconName } from "@/components/ed/Icon";
import { NETWORK_META, parseNetwork } from "@/lib/ed-networks";

/**
 * Admin "Today". What needs the admin first, then sales against yesterday,
 * the week, which networks sell, best sellers, service health and the latest orders.
 * Everything from the old overview is still here.
 */

export function PctBadge({ val }: { val: number }) {
  return (
    <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: val >= 0 ? "#10b981" : "#f87171" }}>
      {val >= 0 ? "▲" : "▼"} {Math.abs(val)}%
    </span>
  );
}

type Today = {
  generatedAt: string;
  nowHour: number;
  today: { sales: number; orders: number; delivered: number; profit: number };
  vsYesterdayPct: number | null;
  hourly: { today: number[]; yesterday: number[] };
  week: Array<{ label: string; revenue: number; orders: number; isToday: boolean }>;
  weekTotals: { revenue: number; orders: number; average: number };
  networks: Array<{ net: string; revenue: number }>;
  topBundles: Array<{ label: string; count: number }>;
  latest: Array<{ reference: string; label: string; phone: string | null; status: string; amount: number; created_at: string }>;
  attention: { waiting: number; stuck: number; failed: number; blockedToday: number };
};
type Health = { id: string; label: string; keySet: boolean; reachable: boolean | null; ms: number | null; balance: number | null };

const money = (n: number) => `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const spaced = (p: string) => p.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
const hourLabel = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function SalesChart({ hourly, nowHour }: { hourly: Today["hourly"]; nowHour: number }) {
  const W = 300, H = 130, L = 34, R = 8, T = 10, B = 28;
  const firstSale = hourly.today.findIndex((v) => v > 0);
  const start = Math.max(0, Math.min(6, firstSale === -1 ? 6 : firstSale - 1));
  const end = Math.min(24, Math.max(Math.ceil(nowHour) + 1, start + 5));
  const lastToday = hourly.today[24] ?? 0;
  const yMax = niceMax(Math.max(lastToday, hourly.yesterday[Math.min(end, 24)] ?? 0, 1));
  const x = (h: number) => L + ((h - start) / (end - start)) * (W - L - R);
  const y = (v: number) => H - B - (v / yMax) * (H - B - T);

  const todayPts: Array<[number, number]> = [];
  for (let h = start; h <= Math.floor(nowHour); h++) todayPts.push([x(h), y(hourly.today[h] ?? 0)]);
  todayPts.push([x(nowHour), y(lastToday)]);
  const yestPts: Array<[number, number]> = [];
  for (let h = start; h <= end; h++) yestPts.push([x(h), y(hourly.yesterday[h] ?? 0)]);

  const line = (pts: Array<[number, number]>) => pts.map(([a, b], i) => `${i === 0 ? "M" : "L"}${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");
  const area = `${line(todayPts)} L${todayPts[todayPts.length - 1][0].toFixed(1)} ${y(0)} L${todayPts[0][0].toFixed(1)} ${y(0)} Z`;
  const ticks = [0, yMax / 2, yMax];
  const xTicks: number[] = [];
  const stepH = end - start > 12 ? 4 : end - start > 7 ? 2 : 1;
  for (let h = start; h <= end; h += stepH) xTicks.push(h);

  return (
    <svg className="ad-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales so far today compared with yesterday. Today ${money(lastToday)}.`}>
      <defs><linearGradient id="adArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbbf24" stopOpacity=".3" /><stop offset="1" stopColor="#fbbf24" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#202b3d" /><text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8b949e">{t.toLocaleString("en-GH", { maximumFractionDigits: 0 })}</text></g>)}
      {xTicks.map((h) => <text key={h} x={x(h)} y={H - 10} textAnchor="middle" fontSize="9" fill="#8b949e">{hourLabel(h % 24)}</text>)}
      <path d={area} fill="url(#adArea)" />
      <path d={line(yestPts)} fill="none" stroke="#8b949e" strokeWidth="1.8" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line(todayPts)} fill="none" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(nowHour)} cy={y(lastToday)} r="4.5" fill="#fbbf24" />
    </svg>
  );
}

function WeekChart({ week }: { week: Today["week"] }) {
  const W = 300, H = 112, L = 30, B = 22, T = 14;
  const max = niceMax(Math.max(...week.map((d) => d.revenue), 1));
  const slot = (W - L - 8) / week.length;
  const bw = Math.min(30, slot - 10);
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  return (
    <svg className="ad-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales for the last seven days: ${week.map((d) => `${d.label} ${money(d.revenue)}`).join(", ")}.`}>
      {[0, max / 2, max].map((t) => <g key={t}><line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#202b3d" /><text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8b949e">{t.toLocaleString("en-GH", { maximumFractionDigits: 0 })}</text></g>)}
      {week.map((d, i) => {
        const cx = L + slot * i + slot / 2;
        const top = y(d.revenue);
        return (
          <g key={d.label + i}>
            <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(2, H - B - top)} rx="4" fill={d.isToday ? "#fbbf24" : "#1e3a5f"} />
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="9" fill={d.isToday ? "#e6edf3" : "#8b949e"} fontWeight={d.isToday ? 700 : 400}>{d.isToday ? "Today" : d.label}</text>
            {(d.isToday || d.revenue === Math.max(...week.map((w) => w.revenue))) && d.revenue > 0 && <text x={cx} y={top - 3} textAnchor="middle" fontSize="9" fill="#e6edf3" fontWeight="700">{Math.round(d.revenue).toLocaleString("en-GH")}</text>}
          </g>
        );
      })}
    </svg>
  );
}

const STATUS_PILL: Record<string, { cls: string; text: string }> = {
  completed: { cls: "d", text: "Delivered" },
  processing: { cls: "s", text: "Sending" },
  pending_approval: { cls: "w", text: "Waiting" },
  pending: { cls: "w", text: "Pending" },
  failed: { cls: "f", text: "Failed" },
  rejected: { cls: "f", text: "Rejected" },
  refunded: { cls: "d", text: "Refunded" },
  not_on_list: { cls: "w", text: "New number" },
};

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

export function Dashboard({ stats, onNavigate }: { stats: StatsData; animated?: boolean; onNavigate: (t: Tab, search?: string) => void }) {
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Health[] | null>(null);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/today");
      const d = (await res.json()) as Today & { error?: string };
      if (!res.ok) { setError(d.error ?? "Could not load today's numbers."); return; }
      setToday(d); setError("");
    } catch { setError("Could not reach the server."); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const id = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/number-check").then((r) => r.json()).then((d: { health?: Health[] }) => setHealth(d.health ?? null)).catch(() => {});
    fetch("/api/admin/store-status").then((r) => r.json()).then((d: { open?: boolean }) => setStoreOpen(d.open !== false)).catch(() => {});
  }, []);

  async function handleSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const d = await fetch("/api/admin/sync-orders", { method: "POST" }).then((r) => r.json());
      setSyncMsg(d.updated > 0 ? `${d.updated} orders updated` : "All up to date");
    } catch { setSyncMsg("Sync failed"); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(""), 3500); }
  }

  const waiting = stats.orders.pendingApproval ?? today?.attention.waiting ?? 0;
  const totalCustomers = useMemo(() => new Set(stats.orders.all.map((o) => o.phone).filter(Boolean)).size, [stats.orders.all]);

  const needs: Array<{ tone: "amber" | "red"; text: string; go: string; tab: Tab }> = [];
  if (waiting > 0) needs.push({ tone: "amber", text: `${waiting} order${waiting === 1 ? "" : "s"} waiting for approval`, go: "Review", tab: "approval-queue" });
  if ((today?.attention.stuck ?? 0) > 0) needs.push({ tone: "red", text: `${today!.attention.stuck} order${today!.attention.stuck === 1 ? "" : "s"} sending for over 10 minutes`, go: "Check", tab: "processing" });
  if ((today?.attention.failed ?? 0) > 0) needs.push({ tone: "red", text: `${today!.attention.failed} failed order${today!.attention.failed === 1 ? "" : "s"} to refund or retry`, go: "Open", tab: "failed-orders" });
  if ((today?.attention.blockedToday ?? 0) > 0) needs.push({ tone: "amber", text: `${today!.attention.blockedToday} number${today!.attention.blockedToday === 1 ? "" : "s"} turned away by the number check today`, go: "See numbers", tab: "mtn-verification" });

  const netTotal = today?.networks.reduce((s, n) => s + n.revenue, 0) ?? 0;
  const maxBundle = Math.max(...(today?.topBundles.map((b) => b.count) ?? [1]), 1);

  return (
    <div className="admin-section ad-today">
      {error && <p className="ad-msg bad" style={{ gridArea: "sales" }}>{error} <button type="button" className="ad-copybtn" onClick={() => void load()}>Try again</button></p>}

      <section className="ad-t-needs" aria-labelledby="needs-h">
        <div className="ad-t-head"><h3 id="needs-h" className="ad-h3">Needs you now</h3>
          {storeOpen !== null && <button type="button" className="ad-store" onClick={() => onNavigate("notifications")} aria-label={storeOpen ? "Store is open. Open store settings." : "Store is closed. Open store settings."}><i style={{ background: storeOpen ? "var(--ed-green)" : "var(--ed-red)" }} />{storeOpen ? "Store open" : "Store closed"}</button>}
        </div>
        {needs.length === 0 ? <p className="ed-muted" style={{ margin: 0, fontSize: 14 }}>Nothing is waiting. You are all caught up.</p> : (
          <div>
            {needs.map((n) => (
              <button key={n.text} type="button" className="ad-need" onClick={() => onNavigate(n.tab)}>
                <i style={{ background: n.tone === "red" ? "var(--ed-red)" : "var(--ed-amber)" }} /><span>{n.text}</span><b>{n.go}</b>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="ad-t-sales" aria-labelledby="sales-h">
        <span id="sales-h" className="ad-lab">Sales so far today</span>
        <span className="ad-big">{today ? money(today.today.sales) : "…"}</span>
        {today?.vsYesterdayPct !== null && today?.vsYesterdayPct !== undefined && (
          <span className="ad-delta" style={{ color: today.vsYesterdayPct >= 0 ? "var(--ed-green)" : "var(--ed-red)" }}>
            <Icon name="up" small className={today.vsYesterdayPct >= 0 ? "" : "ad-flip"} />{Math.abs(today.vsYesterdayPct)}% {today.vsYesterdayPct >= 0 ? "more" : "less"} than yesterday at this time
          </span>
        )}
        {today && <SalesChart hourly={today.hourly} nowHour={today.nowHour} />}
        <div className="ad-legend"><span><i />Today</span><span><i className="dash" />Yesterday</span></div>
      </section>

      <section className="ad-t-mini" aria-label="Today in numbers">
        <div><small>Orders</small><b>{today?.today.orders ?? "…"}</b></div>
        <div><small>Delivered</small><b>{today?.today.delivered ?? "…"}</b></div>
        <div><small>Profit</small><b>{today ? money(today.today.profit) : "…"}</b></div>
        <div><small>Customers</small><b>{totalCustomers.toLocaleString()}</b></div>
      </section>

      <section className="ad-t-services" aria-labelledby="svc-h">
        <h3 id="svc-h" className="ad-h3">Services</h3>
        <div className="ad-lights">
          {(health ?? []).map((h) => (
            <div key={h.id}><b><i className={!h.keySet ? "rr" : h.reachable ? "g" : "a"} />{h.label}</b><span>{!h.keySet ? "No key set" : h.reachable ? (h.balance !== null ? `Balance ${money(h.balance)}` : "Working") : "Not answering"}</span></div>
          ))}
          {!health && <div><b>Checking…</b><span>Asking each service</span></div>}
        </div>
        <div className="ad-qa">
          <button type="button" onClick={() => onNavigate("data-bundles")}><Icon name="plusbox" />Add bundle</button>
          <button type="button" onClick={() => onNavigate("sms")}><Icon name="sms" />Send SMS</button>
          <button type="button" onClick={() => onNavigate("coupons")}><Icon name="tag" />New coupon</button>
          <button type="button" onClick={() => onNavigate("notifications")}><Icon name="store" />Close store</button>
          <button type="button" onClick={() => void handleSync()} disabled={syncing}><Icon name="retry" />{syncing ? "Syncing…" : syncMsg || "Sync orders"}</button>
        </div>
      </section>

      <section className="ad-t-week" aria-labelledby="week-h">
        <div className="ad-t-head"><h3 id="week-h" className="ad-h3">Last 7 days</h3><span className="ed-muted ed-num" style={{ fontSize: 12 }}>{today ? `${money(today.weekTotals.revenue)} from ${today.weekTotals.orders} orders` : ""}</span></div>
        {today && <WeekChart week={today.week} />}
        {today && <p className="ed-muted" style={{ margin: 0, fontSize: 12 }}>Average order {money(today.weekTotals.average)}</p>}
      </section>

      <section className="ad-t-nets" aria-labelledby="net-h">
        <h3 id="net-h" className="ad-h3">Sales by network today</h3>
        {today && netTotal > 0 ? (
          <>
            <div className="ad-split" role="img" aria-label={today.networks.map((n) => `${n.net} ${money(n.revenue)}`).join(", ")}>
              {today.networks.map((n) => <span key={n.net} style={{ width: `${(n.revenue / netTotal) * 100}%`, background: NETWORK_META[parseNetwork(n.net)].color }} />)}
            </div>
            <div className="ad-splitleg">
              {today.networks.map((n) => <span key={n.net}><i style={{ background: NETWORK_META[parseNetwork(n.net)].color }} /><b>{NETWORK_META[parseNetwork(n.net)].label}</b> {money(n.revenue)}</span>)}
            </div>
          </>
        ) : <p className="ed-muted" style={{ margin: 0, fontSize: 13 }}>No sales yet today.</p>}
      </section>

      <section className="ad-t-bundles" aria-labelledby="bun-h">
        <h3 id="bun-h" className="ad-h3">Best sellers today</h3>
        {today?.topBundles.length ? today.topBundles.map((b) => (
          <div key={b.label} className="ad-rank"><b>{b.label}</b><span>{b.count} sold</span><em style={{ ["--w" as string]: `${(b.count / maxBundle) * 100}%` }} /></div>
        )) : <p className="ed-muted" style={{ margin: 0, fontSize: 13 }}>Nothing sold yet today.</p>}
      </section>


      <section className="ad-t-latest" aria-labelledby="late-h">
        <div className="ad-t-head"><h3 id="late-h" className="ad-h3">Latest orders</h3><button type="button" className="ad-link" onClick={() => onNavigate("all-orders")}>See all</button></div>
        {(today?.latest ?? []).map((o) => {
          const pill = STATUS_PILL[o.status.toLowerCase()] ?? { cls: "w", text: o.status };
          return (
            <button key={o.reference} type="button" className="ad-feed" onClick={() => onNavigate("all-orders", o.reference)}>
              <span><b>{o.label}</b>{o.phone ? spaced(o.phone) : ""}</span>
              <span className={`ad-pst ${pill.cls}`}>{pill.text}</span>
              <span className="ed-num">{ago(o.created_at)}</span>
            </button>
          );
        })}
        {today && today.latest.length === 0 && <p className="ed-muted" style={{ margin: 0, fontSize: 13 }}>No orders yet.</p>}
      </section>
    </div>
  );
}

export type { IconName };
