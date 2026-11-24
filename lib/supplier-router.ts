/**
 * Smart supplier router for MTN data, the "Smart" choice in
 * Admin -> Network Providers (system_settings.mtn_provider = "smart").
 *
 * Rule-based, so it needs no AI key. For each order it walks the suppliers in
 * the admin's order. For each supplier:
 *   1. No API key set              -> skip.
 *   2. Balance below the order cost -> skip (low balance).
 *   3. Number not on its list      -> skip (not on list).
 *   4. Otherwise buy there. A clear refusal (no such size, refused number,
 *      not enough money) means nothing was bought, so it moves on to the
 *      next supplier. An unclear failure (timeout, server error) STOPS:
 *      the order may have gone through, and buying it again elsewhere could
 *      deliver it twice.
 *
 * Every step is written to `steps`, which approval saves to the audit log
 * ("smart_router"), so the admin can always see why a supplier was chosen.
 *
 * A balance or list check that can't be answered (supplier unreachable) does
 * not skip the supplier: the purchase itself gives the real answer.
 */

import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";
import { isNotOnListError } from "@/lib/sms";
import { inventorBalance, inventorNumberStatus, inventorPurchase } from "@/lib/inventor";
import {
  yhangMhanyBalance,
  yhangmhanyDefinitelyDidNotTake,
  yhangmhanyPurchase,
  yhangmhanyVerifyNumber,
} from "@/lib/yhangmhany";
import { isSwiftDataConfigured, swiftdataBalance, swiftdataPurchase, swiftdataVerifyNumber } from "@/lib/swiftdata";

export type SupplierId = "yhangmhany" | "swiftdata" | "inventor";
export const SUPPLIER_IDS: SupplierId[] = ["yhangmhany", "swiftdata", "inventor"];
export const SUPPLIER_LABEL: Record<SupplierId, string> = {
  yhangmhany: "Yhang Mhany",
  swiftdata: "SwiftData",
  inventor: "Inventor",
};
export const DEFAULT_SMART_ORDER: SupplierId[] = ["yhangmhany", "swiftdata", "inventor"];
const ORDER_KEY = "smart_supplier_order";

// ── settings ────────────────────────────────────────────────────────────────

/** Keeps only known suppliers, each once, and adds any missing at the end. */
export function cleanSmartOrder(raw: unknown): SupplierId[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SupplierId[] = [];
  for (const v of list) {
    if (SUPPLIER_IDS.includes(v as SupplierId) && !out.includes(v as SupplierId)) out.push(v as SupplierId);
  }
  for (const id of DEFAULT_SMART_ORDER) if (!out.includes(id)) out.push(id);
  return out;
}

export async function getSmartOrder(): Promise<SupplierId[]> {
  try {
    const { data } = await supabase.from("system_settings").select("value").eq("key", ORDER_KEY).maybeSingle();
    return cleanSmartOrder(data?.value ? JSON.parse(data.value) : null);
  } catch {
    return [...DEFAULT_SMART_ORDER];
  }
}

export async function saveSmartOrder(order: unknown): Promise<SupplierId[]> {
  const clean = cleanSmartOrder(order);
  await supabase.from("system_settings").upsert({ key: ORDER_KEY, value: JSON.stringify(clean) }, { onConflict: "key" });
  return clean;
}

// ── supplier adapters ───────────────────────────────────────────────────────

type Answer = "verified" | "not_verified" | "unknown";
type Buy =
  | { ok: true; reference: string | null; balanceAfter: number | null }
  | { ok: false; refused: boolean; notOnList: boolean; body: Record<string, unknown> };

interface Supplier {
  configured: () => boolean;
  balance: () => Promise<number | null>;
  checkNumber: (phone: string) => Promise<Answer>;
  buy: (phone: string, sizeGB: number, reference: string) => Promise<Buy>;
}

function messageOf(body: Record<string, unknown>): string {
  return String(body.message ?? body.error ?? "").slice(0, 200);
}

const SUPPLIERS: Record<SupplierId, Supplier> = {
  yhangmhany: {
    configured: () => !!process.env.YHANGMHANY_API_KEY?.trim(),
    balance: yhangMhanyBalance,
    checkNumber: yhangmhanyVerifyNumber,
    buy: async (phone, sizeGB) => {
      const r = await yhangmhanyPurchase(phone, sizeGB);
      if (r.ok) return { ok: true, reference: r.reference, balanceAfter: null };
      const msg = messageOf(r.body);
      return { ok: false, refused: yhangmhanyDefinitelyDidNotTake(msg), notOnList: false, body: r.body };
    },
  },
  swiftdata: {
    configured: isSwiftDataConfigured,
    balance: swiftdataBalance,
    checkNumber: swiftdataVerifyNumber,
    buy: async (phone, sizeGB, reference) => {
      const r = await swiftdataPurchase(phone, sizeGB, reference);
      if (r.ok) return { ok: true, reference: r.reference, balanceAfter: null };
      return { ok: false, refused: r.definitelyNotTaken, notOnList: false, body: r.body };
    },
  },
  inventor: {
    configured: () => !!process.env.INVENTOR_API_KEY?.trim(),
    balance: inventorBalance,
    checkNumber: (phone) => inventorNumberStatus(phone, isNotOnListError),
    buy: async (phone, sizeGB, reference) => {
      const r = await inventorPurchase("MTN", phone, sizeGB, reference);
      if (r.ok) return { ok: true, reference: r.reference, balanceAfter: r.balance };
      const notOnList = isNotOnListError(messageOf(r.body));
      // Only "not on the list" is a sure refusal here; anything else stops.
      return { ok: false, refused: notOnList, notOnList, body: r.body };
    },
  },
};

// ── low-balance alerts (at most one per supplier per hour per server) ───────

const lastLowAlert = new Map<SupplierId, number>();
function alertLowBalance(id: SupplierId, balance: number, needed: number): void {
  const now = Date.now();
  if ((lastLowAlert.get(id) ?? 0) > now - 60 * 60_000) return;
  lastLowAlert.set(id, now);
  sendAdminAlert(
    `⚠️ <b>${SUPPLIER_LABEL[id]} balance too low</b>: GH₵${balance.toFixed(2)} (an order needed GH₵${needed.toFixed(2)}).\n` +
    `Smart routing is skipping it until you top up.`,
  ).catch(() => {});
}

// ── the router ──────────────────────────────────────────────────────────────

export type RouterStep = { supplier: SupplierId; result: string };

export type RouterOutcome =
  | { kind: "placed"; supplier: SupplierId; reference: string | null; balanceAfter: number | null; steps: RouterStep[] }
  /** An unclear failure at `supplier`: stop, never try another supplier. */
  | { kind: "failed"; supplier: SupplierId; body: Record<string, unknown>; steps: RouterStep[] }
  /** Every supplier that has the number (or might) is short of money. */
  | { kind: "needs_topup"; steps: RouterStep[] }
  /** No supplier has this number on its list. */
  | { kind: "not_on_any_list"; steps: RouterStep[] }
  /** No supplier has an API key. */
  | { kind: "no_supplier"; steps: RouterStep[] };

export async function routeMtnOrder(order: {
  reference: string;
  phone: string;
  sizeGB: number;
  /** What the order costs us in GHS; a supplier needs at least this much. */
  cost: number;
}, overrides?: Partial<Record<SupplierId, Supplier>>): Promise<RouterOutcome> {
  const steps: RouterStep[] = [];
  let lowBalance = 0;
  let notOnList = 0;
  let usable = 0;

  for (const id of await getSmartOrder()) {
    const s = overrides?.[id] ?? SUPPLIERS[id];
    if (!s.configured()) {
      steps.push({ supplier: id, result: "skipped: no API key" });
      continue;
    }
    usable++;

    const balance = await s.balance().catch(() => null);
    if (balance !== null && order.cost > 0 && balance < order.cost) {
      lowBalance++;
      steps.push({ supplier: id, result: `skipped: balance GH₵${balance.toFixed(2)} < order GH₵${order.cost.toFixed(2)}` });
      alertLowBalance(id, balance, order.cost);
      continue;
    }

    const listed = await s.checkNumber(order.phone).catch((): Answer => "unknown");
    if (listed === "not_verified") {
      notOnList++;
      steps.push({ supplier: id, result: "skipped: number not on its list" });
      continue;
    }

    const bought = await s.buy(order.phone, order.sizeGB, order.reference);
    if (bought.ok) {
      steps.push({ supplier: id, result: `bought${balance !== null ? ` (balance was GH₵${balance.toFixed(2)})` : ""}` });
      return { kind: "placed", supplier: id, reference: bought.reference, balanceAfter: bought.balanceAfter, steps };
    }
    const why = messageOf(bought.body) || "no reason given";
    if (!bought.refused) {
      steps.push({ supplier: id, result: `unclear failure, stopped: ${why}` });
      return { kind: "failed", supplier: id, body: bought.body, steps };
    }
    if (bought.notOnList) notOnList++;
    steps.push({ supplier: id, result: `refused, nothing bought: ${why}` });
  }

  if (usable === 0) return { kind: "no_supplier", steps };
  if (lowBalance > 0) return { kind: "needs_topup", steps };
  if (notOnList > 0) return { kind: "not_on_any_list", steps };
  // Every supplier refused for other reasons (e.g. size not sold anywhere).
  return { kind: "failed", supplier: steps[steps.length - 1]?.supplier ?? "inventor", body: { message: steps.map((s) => `${SUPPLIER_LABEL[s.supplier]}: ${s.result}`).join("; ") }, steps };
}

export function describeSteps(steps: RouterStep[]): string {
  return steps.map((s) => `${SUPPLIER_LABEL[s.supplier]} — ${s.result}`).join("\n");
}
