import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Telegram event routing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TELEGRAM_ADMIN_BOT_TOKEN", "elite-agent-token");
    vi.stubEnv("TELEGRAM_ASSISTANT_BOT_TOKEN", "dallen-assistant-token");
    vi.stubEnv("TELEGRAM_SWIFT_BOT_TOKEN", "swift-data-token");
    vi.stubEnv("TELEGRAM_ADMIN_CHAT_ID", "12345");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends new orders to Elite Data Agent and Dallen assistant", async () => {
    const { sendNewOrderAlert } = await import("@/lib/telegram");
    await sendNewOrderAlert("new order", { inline_keyboard: [] });

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringContaining("botelite-agent-token/sendMessage"),
      expect.stringContaining("botdallen-assistant-token/sendMessage"),
    ]));
    expect(urls).toHaveLength(2);
  });

  it("sends completed orders and wallet top-ups only to Dallen assistant", async () => {
    const { sendCompletedOrderAlert, sendWalletTopupAlert } = await import("@/lib/telegram");
    await sendCompletedOrderAlert("completed");
    await sendWalletTopupAlert("top-up");

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.includes("botdallen-assistant-token/sendMessage"))).toBe(true);
  });

  it("sends stuck orders only to Elite Data Agent", async () => {
    const { sendStuckOrderAlert } = await import("@/lib/telegram");
    await sendStuckOrderAlert("stuck");

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("botelite-agent-token/sendMessage");
  });

  it("sends refund and withdrawal requests only to Swift Data GH", async () => {
    const { sendRefundRequestAlert, sendWithdrawalRequestAlert } = await import("@/lib/telegram");
    await sendRefundRequestAlert("refund");
    await sendWithdrawalRequestAlert("withdrawal");

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.includes("botswift-data-token/sendMessage"))).toBe(true);
  });
});
