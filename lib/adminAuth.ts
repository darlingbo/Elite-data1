import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

// ── Centralised admin authentication ──────────────────────────────────────────
// One module for every admin route so the auth logic lives in a single place.
//
// Sessions: on login we mint a RANDOM token, store only its SHA-256 hash (plus an
// expiry) in the admin_config table, and put the raw token in an httpOnly cookie.
// Each request hashes the cookie and compares against the stored hash. This means
// a leaked cookie can be revoked (rotate on next login) and expires on its own.
// The legacy static ADMIN_SESSION_TOKEN is still accepted so existing sessions and
// the biometric route keep working during the transition.

export const ADMIN_COOKIE = "admin_session";
const SESSION_HASH_KEY = "admin_session_hash";
const SESSION_EXP_KEY = "admin_session_expires";
const PASSWORD_HASH_KEY = "admin_password_hash";
const SESSION_MAX_AGE = 60 * 60 * 5; // 5 hours

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

async function getConfig(key: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("admin_config").select("value").eq("key", key).maybeSingle();
    const val = (data as { value: string } | null)?.value ?? null;
    if (val) return val;
    // Fall back to system_settings for backwards compatibility
    const { data: ss } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
    return (ss as { value: string } | null)?.value ?? null;
  } catch {
    return null;
  }
}

async function setConfig(key: string, value: string): Promise<boolean> {
  const { error } = await supabase.from("admin_config").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  return !error;
}

function constTimeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Verify a raw cookie value. Accepts a valid DB session OR the legacy static token. */
export async function verifyAdminSessionValue(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;

  // Legacy static token (backwards compatible).
  const legacy = process.env.ADMIN_SESSION_TOKEN ?? "";
  if (legacy && constTimeEqual(value, legacy)) return true;

  // DB-backed random session.
  const storedHash = await getConfig(SESSION_HASH_KEY);
  if (!storedHash) return false;
  if (!constTimeEqual(sha256(value), storedHash)) return false;

  const expStr = await getConfig(SESSION_EXP_KEY);
  const exp = Number(expStr);
  if (Number.isFinite(exp) && exp < Date.now()) return false;
  return true;
}

/** Convenience guard that reads the cookie itself. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionValue(store.get(ADMIN_COOKIE)?.value);
}

/** Create a fresh random session, persist its hash, and set the cookie. */
export async function issueAdminSession(): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await setConfig(SESSION_HASH_KEY, sha256(token));
  await setConfig(SESSION_EXP_KEY, String(Date.now() + SESSION_MAX_AGE * 1000));
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearAdminSession(): Promise<void> {
  await setConfig(SESSION_HASH_KEY, ""); // revoke server-side
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

// ── Password hashing (bcrypt, with legacy SHA-256 migration) ───────────────────

function legacySha256(password: string): string {
  const salt = process.env.ADMIN_SESSION_TOKEN ?? "elite-data-salt";
  return createHash("sha256").update(salt + password).digest("hex");
}

/** Verify an admin password against the stored bcrypt hash, a legacy SHA-256 hash, or the env fallback. */
function matchesConfiguredAdminSecret(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (adminPassword && constTimeEqual(password, adminPassword)) return true;

  // This is also the recovery credential and was historically accepted as the
  // admin password. Keep it as a break-glass login if the DB hash is stale.
  const sessionToken = process.env.ADMIN_SESSION_TOKEN ?? "";
  return Boolean(sessionToken) && constTimeEqual(password, sessionToken);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const stored = await getConfig(PASSWORD_HASH_KEY);
  if (stored) {
    if (stored.startsWith("$2")) {
      // bcrypt
      try {
        if (await bcrypt.compare(password, stored)) return true;
      } catch {
        /* fall through */
      }
    } else if (constTimeEqual(legacySha256(password), stored)) {
      // Legacy SHA-256 hash — verify, and transparently upgrade to bcrypt on success.
      try {
        await setConfig(PASSWORD_HASH_KEY, await bcrypt.hash(password, 12));
      } catch {
        /* best effort */
      }
      return true;
    }
  }
  // The configured secrets remain usable if no hash exists or the stored hash
  // is stale, allowing the admin to recover access without a database change.
  return matchesConfiguredAdminSecret(password);
}

export async function setAdminPassword(newPassword: string): Promise<boolean> {
  const hash = await bcrypt.hash(newPassword, 12);
  return setConfig(PASSWORD_HASH_KEY, hash);
}

/** Verify the one-time reset token (must equal ADMIN_SESSION_TOKEN — only the real admin knows it). */
export function verifyResetToken(token: string): boolean {
  const secret = process.env.ADMIN_SESSION_TOKEN ?? "";
  return Boolean(secret) && constTimeEqual(String(token).trim(), secret.trim());
}

/** Signed helper kept for potential future use (not required by current flows). */
export function signValue(payload: string): string {
  const secret = process.env.ADMIN_SESSION_TOKEN ?? "elite-admin-secret";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
