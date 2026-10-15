import { supabase } from "@/lib/supabase";
import { DEFAULT_CLOSED_MESSAGE } from "@/lib/store-closed";

export interface StoreStatus {
  open: boolean;
  /** Message to show customers while closed (admin's text, or the default). */
  message: string;
}

// proxy.ts asks for this on every page request, so keep a short per-instance
// cache. Worst case after the admin flips the switch: ~10s before another
// server instance notices.
const CACHE_MS = 10_000;
const DB_TIMEOUT_MS = 2_500;

let cached: { at: number; value: StoreStatus } | null = null;

export function clearStoreStatusCache() {
  cached = null;
}

/**
 * Reads the admin Close Store switch (system_settings.store_open).
 * Fails OPEN: if the database can't be reached we keep the last known state, or
 * treat the store as open — a database blip must never take the shop offline.
 */
export async function getStoreStatus(): Promise<StoreStatus> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["store_open", "store_closed_message"])
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) throw error;

    const rows = new Map((data ?? []).map((row) => [row.key as string, row.value as string | null]));
    const value: StoreStatus = {
      open: rows.get("store_open") !== "false",
      message: rows.get("store_closed_message")?.trim() || DEFAULT_CLOSED_MESSAGE,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return cached?.value ?? { open: true, message: DEFAULT_CLOSED_MESSAGE };
  }
}
