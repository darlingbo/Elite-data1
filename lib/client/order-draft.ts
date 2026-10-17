// Browser-side memory for the buying flow. Phone numbers are kept in
// sessionStorage (this tab only) and a short "recent numbers" list in
// localStorage on the customer's own phone. Nothing here is sent anywhere.
import type { BuyNetwork } from "@/lib/ed-networks";

export interface OrderDraft {
  network?: BuyNetwork;
  /** The number the data goes to. */
  recipient?: string;
  /** The recipient number the check last accepted, so Pay can show a tick. */
  verifiedFor?: string;
}

const DRAFT_KEY = "ed_order_draft";
const RECENT_KEY = "elite_beneficiaries"; // same key the old checkout used for saved numbers

export function readDraft(): OrderDraft {
  try {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(DRAFT_KEY) : null;
    return raw ? (JSON.parse(raw) as OrderDraft) : {};
  } catch {
    return {};
  }
}

export function writeDraft(patch: Partial<OrderDraft>): OrderDraft {
  const next = { ...readDraft(), ...patch };
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function clearDraft(): void {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

export interface RecentNumber { label: string; phone: string; network?: BuyNetwork }

export function readRecents(): RecentNumber[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(RECENT_KEY) : null;
    const list = raw ? (JSON.parse(raw) as RecentNumber[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.phone === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function addRecent(phone: string, network?: BuyNetwork): void {
  const clean = phone.replace(/\s/g, "");
  if (!clean) return;
  try {
    const rest = readRecents().filter((r) => r.phone !== clean);
    const prev = readRecents().find((r) => r.phone === clean);
    const next = [{ label: prev?.label ?? clean, phone: clean, network }, ...rest].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function spacedPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
