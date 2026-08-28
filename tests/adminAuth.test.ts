import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const state: { storedPasswordHash: string | null } = {
  storedPasswordHash: null,
};

function makeQuery(table: string) {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.maybeSingle = async () => {
    if (table === "admin_config" && state.storedPasswordHash) {
      return { data: { value: state.storedPasswordHash }, error: null };
    }
    return { data: null, error: null };
  };
  query.upsert = async () => ({ error: null });
  return query;
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => makeQuery(table) },
}));

import { verifyAdminPassword } from "@/lib/adminAuth";

beforeEach(() => {
  state.storedPasswordHash = null;
  process.env.ADMIN_PASSWORD = "configured-password";
  process.env.ADMIN_SESSION_TOKEN = "recovery-session-token";
});

describe("verifyAdminPassword", () => {
  it("accepts the stored bcrypt password", async () => {
    state.storedPasswordHash = await bcrypt.hash("stored-password", 4);
    await expect(verifyAdminPassword("stored-password")).resolves.toBe(true);
  });

  it("accepts ADMIN_PASSWORD when the stored hash is stale", async () => {
    state.storedPasswordHash = await bcrypt.hash("old-password", 4);
    await expect(verifyAdminPassword("configured-password")).resolves.toBe(true);
  });

  it("accepts ADMIN_SESSION_TOKEN when the stored hash is stale", async () => {
    state.storedPasswordHash = await bcrypt.hash("old-password", 4);
    await expect(verifyAdminPassword("recovery-session-token")).resolves.toBe(true);
  });

  it("rejects an unknown password", async () => {
    state.storedPasswordHash = await bcrypt.hash("old-password", 4);
    await expect(verifyAdminPassword("incorrect")).resolves.toBe(false);
  });
});
