import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

// ── Stateless, signed agent session ───────────────────────────────────────────
// A session is an HMAC-signed token stored in an httpOnly cookie. It binds the
// browser to a specific agent id and an auth "level":
//   - "full" -> the agent logged in with email + password
//   - "code" -> the agent logged in with their (public) referral code only
//
// Money-moving endpoints (withdraw, wallet spend, plan/type changes) must call
// requireAgentSession() and confirm the token's agentId matches the request.
// Because referral codes are public, "code" sessions are treated as view-only
// and are NOT sufficient to move money -- those endpoints require "full".

export const AGENT_COOKIE = "agent_session";
export type AgentAuthLevel = "full" | "code";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function secret(): string {
  return process.env.AGENT_SESSION_SECRET || process.env.ADMIN_SESSION_TOKEN || "";
}

function sign(payload: string): string {
  const signingSecret = secret();
  if (!signingSecret) {
    throw new Error("AGENT_SESSION_SECRET is not configured.");
  }
  return createHmac("sha256", signingSecret).update(payload).digest("base64url");
}

export function buildAgentToken(agentId: string, level: AgentAuthLevel): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${agentId}.${level}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Set the session cookie on a successful login. Call from the login route. */
export async function issueAgentSession(agentId: string, level: AgentAuthLevel): Promise<void> {
  const token = buildAgentToken(agentId, level);
  const store = await cookies();
  store.set(AGENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearAgentSession(): Promise<void> {
  const store = await cookies();
  store.delete(AGENT_COOKIE);
}

export interface AgentSession {
  agentId: string;
  level: AgentAuthLevel;
}

/** Pure verification of a raw token string. Exported for unit tests. */
export function verifyAgentToken(token: string | undefined | null): AgentSession | null {
  if (!token) return null;
  if (!secret()) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [agentId, level, expStr, sig] = parts;
  const payload = `${agentId}.${level}.${expStr}`;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if (level !== "full" && level !== "code") return null;
  return { agentId, level };
}

/** Read and verify the session from the request cookie. Returns null if invalid. */
export function readAgentSession(request: NextRequest): AgentSession | null {
  return verifyAgentToken(request.cookies.get(AGENT_COOKIE)?.value);
}

export type RequireResult =
  | { ok: true; session: AgentSession }
  | { ok: false; status: number; error: string };

/**
 * Guard for agent endpoints.
 *  - Verifies the cookie is present and valid.
 *  - Confirms it belongs to the agentId the request claims to act on.
 *  - When requireFull is true, rejects public "code" sessions (used for money-out).
 */
export function requireAgentSession(
  request: NextRequest,
  claimedAgentId: string | null | undefined,
  opts: { requireFull?: boolean } = {}
): RequireResult {
  const session = readAgentSession(request);
  if (!session) {
    return { ok: false, status: 401, error: "Please log in again to continue." };
  }
  if (claimedAgentId && session.agentId !== claimedAgentId) {
    return { ok: false, status: 403, error: "Session does not match this account." };
  }
  if (opts.requireFull && session.level !== "full") {
    return {
      ok: false,
      status: 403,
      error: "For your security, log in with your email and password to perform this action.",
    };
  }
  return { ok: true, session };
}
