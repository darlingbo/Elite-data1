import { describe, it, expect, beforeAll } from "vitest";
import { buildAgentToken, verifyAgentToken } from "@/lib/agentAuth";

beforeAll(() => {
  process.env.AGENT_SESSION_SECRET = "test-secret-for-agent-sessions";
});

describe("agent session tokens", () => {
  it("round-trips a valid token", () => {
    const token = buildAgentToken("agent-123", "full");
    const session = verifyAgentToken(token);
    expect(session).not.toBeNull();
    expect(session?.agentId).toBe("agent-123");
    expect(session?.level).toBe("full");
  });

  it("preserves the auth level", () => {
    expect(verifyAgentToken(buildAgentToken("a", "code"))?.level).toBe("code");
  });

  it("rejects a tampered agentId (signature no longer matches)", () => {
    const token = buildAgentToken("agent-123", "full");
    const parts = token.split(".");
    parts[0] = "agent-999"; // try to impersonate another agent
    expect(verifyAgentToken(parts.join("."))).toBeNull();
  });

  it("rejects a tampered level (privilege escalation attempt)", () => {
    const token = buildAgentToken("agent-123", "code");
    const parts = token.split(".");
    parts[1] = "full"; // try to upgrade a view-only session
    expect(verifyAgentToken(parts.join("."))).toBeNull();
  });

  it("rejects an expired token", () => {
    const parts = buildAgentToken("agent-123", "full").split(".");
    parts[2] = String(Date.now() - 1000); // set expiry in the past
    // signature won't match the altered expiry, so this must be null either way
    expect(verifyAgentToken(parts.join("."))).toBeNull();
  });

  it("rejects garbage and empty input", () => {
    expect(verifyAgentToken("")).toBeNull();
    expect(verifyAgentToken(null)).toBeNull();
    expect(verifyAgentToken("not.a.valid.token")).toBeNull();
    expect(verifyAgentToken("only.three.parts")).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = buildAgentToken("agent-123", "full");
    process.env.AGENT_SESSION_SECRET = "a-completely-different-secret";
    expect(verifyAgentToken(token)).toBeNull();
    process.env.AGENT_SESSION_SECRET = "test-secret-for-agent-sessions"; // restore
  });

  it("fails closed when no session secret is configured", () => {
    const token = buildAgentToken("agent-123", "full");
    delete process.env.AGENT_SESSION_SECRET;
    delete process.env.ADMIN_SESSION_TOKEN;
    expect(verifyAgentToken(token)).toBeNull();
    expect(() => buildAgentToken("agent-123", "full")).toThrow("AGENT_SESSION_SECRET");
    process.env.AGENT_SESSION_SECRET = "test-secret-for-agent-sessions";
  });
});
