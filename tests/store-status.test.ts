import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = { key: string; value: string | null };
type Result = { data: Row[] | null; error: { message: string } | null };

// Fresh module (and fresh cache) per test, with the database stubbed.
async function loadWith(results: Result[]) {
  vi.resetModules();
  const queue = [...results];
  const query = vi.fn(() => Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]));
  vi.doMock("@/lib/supabase", () => ({
    supabase: { from: () => ({ select: () => ({ in: () => ({ abortSignal: query }) }) }) },
  }));
  const mod = await import("@/lib/store-status");
  const { DEFAULT_CLOSED_MESSAGE } = await import("@/lib/store-closed");
  return { ...mod, query, DEFAULT_CLOSED_MESSAGE };
}

const ok = (rows: Row[]): Result => ({ data: rows, error: null });
const dbDown: Result = { data: null, error: { message: "connection refused" } };

describe("getStoreStatus", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("is open when the switch was never set", async () => {
    const { getStoreStatus } = await loadWith([ok([])]);
    expect((await getStoreStatus()).open).toBe(true);
  });

  it("is open when store_open is 'true'", async () => {
    const { getStoreStatus } = await loadWith([ok([{ key: "store_open", value: "true" }])]);
    expect((await getStoreStatus()).open).toBe(true);
  });

  it("is closed with the default silentecho message when no message was saved", async () => {
    const { getStoreStatus, DEFAULT_CLOSED_MESSAGE } = await loadWith([ok([{ key: "store_open", value: "false" }])]);
    const status = await getStoreStatus();
    expect(status.open).toBe(false);
    expect(status.message).toBe(DEFAULT_CLOSED_MESSAGE);
    expect(status.message).toContain("silentecho.online");
  });

  it("uses the admin's own message (trimmed), and falls back to default when it is blank", async () => {
    const custom = await loadWith([ok([{ key: "store_open", value: "false" }, { key: "store_closed_message", value: "  Back at 5pm  " }])]);
    expect((await custom.getStoreStatus()).message).toBe("Back at 5pm");

    const blank = await loadWith([ok([{ key: "store_open", value: "false" }, { key: "store_closed_message", value: "   " }])]);
    expect((await blank.getStoreStatus()).message).toBe(blank.DEFAULT_CLOSED_MESSAGE);
  });

  it("fails OPEN when the database is unreachable and nothing is cached", async () => {
    const { getStoreStatus } = await loadWith([dbDown]);
    expect((await getStoreStatus()).open).toBe(true);
  });

  it("keeps the last known state (still closed) if the database goes down later", async () => {
    const { getStoreStatus, query } = await loadWith([ok([{ key: "store_open", value: "false" }]), dbDown]);
    expect((await getStoreStatus()).open).toBe(false);
    vi.setSystemTime(Date.now() + 60_000); // cache expired -> re-query -> DB error
    expect((await getStoreStatus()).open).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("caches for a few seconds so every page view does not hit the database", async () => {
    const { getStoreStatus, query } = await loadWith([ok([])]);
    await getStoreStatus();
    await getStoreStatus();
    expect(query).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 11_000);
    await getStoreStatus();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("clearStoreStatusCache makes the next call re-read immediately", async () => {
    const { getStoreStatus, clearStoreStatusCache, query } = await loadWith([
      ok([]),
      ok([{ key: "store_open", value: "false" }]),
    ]);
    expect((await getStoreStatus()).open).toBe(true);
    clearStoreStatusCache();
    expect((await getStoreStatus()).open).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
