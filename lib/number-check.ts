import { supabase } from "@/lib/supabase";
import { normalizeGhPhone } from "@/lib/phone";
import { yhangmhanyVerifyNumber, yhangMhanyBalance } from "@/lib/yhangmhany";
import { inventorNumberStatus, inventorBalance } from "@/lib/inventor";
import { isNotOnListError } from "@/lib/sms";
import { auditLog } from "@/lib/audit";

/**
 * Checkout number check for MTN data.
 *
 * The customer's data number is asked of two providers, one after the other.
 * The second one is asked only when the first does not have the number. A number
 * that is on neither list is blocked before any payment is started. When
 * neither provider can be reached, the admin's setting decides (block or allow).
 *
 * Provider keys are only ever read from the environment here. They are never
 * returned to a caller and never logged.
 */

export type ProviderId = "yhangmhany" | "inventor";
export type ProviderAnswer = "verified" | "not_verified" | "unknown";
export type CheckOrder = "yhangmhany_first" | "inventor_first";
export type UnreachablePolicy = "block" | "allow";

export interface NumberCheckSettings {
  enabled: boolean;
  order: CheckOrder;
  onUnreachable: UnreachablePolicy;
  cacheHours: 1 | 24;
  /** Where a customer with a new number goes to be verified. Empty = not set yet. */
  verifyUrl: string;
}

export const DEFAULT_SETTINGS: NumberCheckSettings = {
  enabled: true,
  order: "yhangmhany_first",
  onUnreachable: "block",
  cacheHours: 24,
  verifyUrl: "",
};

export const SETTING_KEYS = {
  enabled: "mtn_verification_enabled",
  order: "number_check_order",
  onUnreachable: "number_check_unreachable",
  cacheHours: "number_check_cache_hours",
  verifyUrl: "verification_page_url",
} as const;

export type NumberCheckOutcome =
  | { status: "verified"; allowed: true; provider: ProviderId | "cache" }
  | { status: "not_verified"; allowed: false; tried: ProviderId[] }
  | { status: "unreachable"; allowed: boolean; tried: ProviderId[] }
  | { status: "skipped"; allowed: true; reason: "disabled" | "not_mtn" };

export interface Provider {
  id: ProviderId;
  configured: () => boolean;
  check: (phone: string) => Promise<ProviderAnswer>;
}

export const providers: Record<ProviderId, Provider> = {
  yhangmhany: {
    id: "yhangmhany",
    configured: () => !!process.env.YHANGMHANY_API_KEY?.trim(),
    check: async (phone) => {
      if (!process.env.YHANGMHANY_API_KEY?.trim()) return "unknown";
      return yhangmhanyVerifyNumber(phone);
    },
  },
  inventor: {
    id: "inventor",
    configured: () => !!process.env.INVENTOR_API_KEY?.trim(),
    check: (phone) => inventorNumberStatus(phone, isNotOnListError),
  },
};

// ── settings ────────────────────────────────────────────────────────────────

export function parseSettings(rows: Array<{ key: string; value: string | null }>): NumberCheckSettings {
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const order = map.get(SETTING_KEYS.order);
  const policy = map.get(SETTING_KEYS.onUnreachable);
  const hours = Number(map.get(SETTING_KEYS.cacheHours));
  return {
    enabled: map.get(SETTING_KEYS.enabled) !== "false",
    order: order === "inventor_first" ? "inventor_first" : "yhangmhany_first",
    onUnreachable: policy === "allow" ? "allow" : "block",
    cacheHours: hours === 1 ? 1 : 24,
    verifyUrl: safeHttpUrl(map.get(SETTING_KEYS.verifyUrl)) ?? "",
  };
}

/** Only http(s) links may be shown to customers. Anything else is dropped. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function getNumberCheckSettings(): Promise<NumberCheckSettings> {
  try {
    const { data } = await supabase.from("system_settings").select("key, value").in("key", Object.values(SETTING_KEYS));
    return parseSettings((data as Array<{ key: string; value: string | null }> | null) ?? []);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveNumberCheckSettings(patch: Partial<NumberCheckSettings>): Promise<NumberCheckSettings> {
  const rows: Array<{ key: string; value: string }> = [];
  if (typeof patch.enabled === "boolean") rows.push({ key: SETTING_KEYS.enabled, value: String(patch.enabled) });
  if (patch.order === "yhangmhany_first" || patch.order === "inventor_first") rows.push({ key: SETTING_KEYS.order, value: patch.order });
  if (patch.onUnreachable === "block" || patch.onUnreachable === "allow") rows.push({ key: SETTING_KEYS.onUnreachable, value: patch.onUnreachable });
  if (patch.cacheHours === 1 || patch.cacheHours === 24) rows.push({ key: SETTING_KEYS.cacheHours, value: String(patch.cacheHours) });
  if (typeof patch.verifyUrl === "string") {
    const clean = patch.verifyUrl.trim() === "" ? "" : safeHttpUrl(patch.verifyUrl);
    if (clean === null) throw new Error("The verification page link must start with https:// or http://");
    rows.push({ key: SETTING_KEYS.verifyUrl, value: clean });
  }
  if (rows.length) await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
  return getNumberCheckSettings();
}

// ── cache of numbers that recently passed ───────────────────────────────────

const passed = new Map<string, { until: number; provider: ProviderId }>();
const MAX_CACHE = 5_000;

export function rememberPassed(phone: string, provider: ProviderId, hours: number, now = Date.now()): void {
  if (passed.size >= MAX_CACHE) {
    const first = passed.keys().next().value;
    if (first !== undefined) passed.delete(first);
  }
  passed.set(phone, { until: now + hours * 3_600_000, provider });
}

export function recallPassed(phone: string, now = Date.now()): ProviderId | null {
  const hit = passed.get(phone);
  if (!hit) return null;
  if (hit.until <= now) { passed.delete(phone); return null; }
  return hit.provider;
}

export function clearPassedCache(): void {
  passed.clear();
}

// ── the check ───────────────────────────────────────────────────────────────

export function orderedProviders(order: CheckOrder): ProviderId[] {
  return order === "inventor_first" ? ["inventor", "yhangmhany"] : ["yhangmhany", "inventor"];
}

/**
 * Pure decision logic so it can be tested without any network.
 * Asks providers in order and stops at the first "verified".
 */
export async function decide(
  phone: string,
  settings: NumberCheckSettings,
  lookup: Record<ProviderId, Provider> = providers,
): Promise<NumberCheckOutcome> {
  const tried: ProviderId[] = [];
  const answers: ProviderAnswer[] = [];

  for (const id of orderedProviders(settings.order)) {
    const provider = lookup[id];
    if (!provider.configured()) {
      tried.push(id);
      answers.push("unknown");
      continue;
    }
    const answer = await provider.check(phone).catch((): ProviderAnswer => "unknown");
    tried.push(id);
    answers.push(answer);
    if (answer === "verified") return { status: "verified", allowed: true, provider: id };
  }

  // A real "not on the list" needs BOTH providers to say so. One answer plus
  // one outage is not enough to turn a paying customer away as "new number".
  if (answers.length > 0 && answers.every((a) => a === "not_verified")) {
    return { status: "not_verified", allowed: false, tried };
  }
  return { status: "unreachable", allowed: settings.onUnreachable === "allow", tried };
}

export interface CheckOptions {
  /** Trusted server callers may bypass the admin on/off switch. */
  force?: boolean;
  /** Only MTN bundles are checked. Pass the bundle's network when known. */
  network?: string | null;
  ip?: string;
}

export async function checkNumber(rawPhone: string, options: CheckOptions = {}): Promise<NumberCheckOutcome> {
  const phone = normalizeGhPhone(String(rawPhone ?? ""));
  if (!phone) return { status: "unreachable", allowed: false, tried: [] };

  if (options.network && options.network !== "mtn") return { status: "skipped", allowed: true, reason: "not_mtn" };

  const settings = await getNumberCheckSettings();
  if (!settings.enabled && !options.force) return { status: "skipped", allowed: true, reason: "disabled" };

  const cached = recallPassed(phone);
  if (cached) return { status: "verified", allowed: true, provider: "cache" };

  const outcome = await decide(phone, settings);
  if (outcome.status === "verified" && outcome.provider !== "cache") {
    rememberPassed(phone, outcome.provider, settings.cacheHours);
  }
  if (outcome.status === "not_verified" || (outcome.status === "unreachable" && !outcome.allowed)) {
    // Admin "Numbers" screen reads these. Fire and forget.
    void auditLog("number_check_blocked", { phone, status: outcome.status, tried: outcome.tried }, options.ip);
  }
  return outcome;
}

// ── customer-facing wording ─────────────────────────────────────────────────

export const NOT_VERIFIED_MESSAGE =
  "New numbers must be verified before they can buy data. Submit this number to be verified, then come back and tap Check again.";
export const UNREACHABLE_MESSAGE =
  "We could not check this number right now. Please try again in a minute.";

// ── admin health ────────────────────────────────────────────────────────────

export interface ProviderHealth {
  id: ProviderId;
  label: string;
  keySet: boolean;
  reachable: boolean | null;
  ms: number | null;
  balance: number | null;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number }> {
  const start = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - start };
  } catch {
    return { value: null, ms: Date.now() - start };
  }
}

export async function providerHealth(): Promise<ProviderHealth[]> {
  const [yhm, inv] = await Promise.all([timed(yhangMhanyBalance), timed(inventorBalance)]);
  return [
    { id: "yhangmhany", label: "Yhang Mhany", keySet: providers.yhangmhany.configured(), reachable: providers.yhangmhany.configured() ? yhm.value !== null : null, ms: yhm.value !== null ? yhm.ms : null, balance: yhm.value },
    { id: "inventor", label: "Inventor", keySet: providers.inventor.configured(), reachable: providers.inventor.configured() ? inv.value !== null : null, ms: inv.value !== null ? inv.ms : null, balance: inv.value },
  ];
}

// ── admin test box ──────────────────────────────────────────────────────────

export type TestAnswer = ProviderAnswer | "no_key";

/** Ask both providers about one number, ignoring the cache and the on/off switch. */
export async function testNumber(rawPhone: string): Promise<{ phone: string; answers: Record<ProviderId, TestAnswer> } | null> {
  const phone = normalizeGhPhone(String(rawPhone ?? ""));
  if (!phone) return null;
  const ask = async (id: ProviderId): Promise<TestAnswer> =>
    providers[id].configured() ? providers[id].check(phone).catch((): ProviderAnswer => "unknown") : "no_key";
  const [yhangmhany, inventor] = await Promise.all([ask("yhangmhany"), ask("inventor")]);
  return { phone, answers: { yhangmhany, inventor } };
}
