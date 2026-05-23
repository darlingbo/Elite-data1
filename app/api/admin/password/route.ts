import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

function hashPassword(password: string): string {
  // SHA-256 with a fixed site salt — fast enough for admin (single user, already rate-limited at login)
  const salt = process.env.ADMIN_SESSION_TOKEN ?? "elite-data-salt";
  return createHash("sha256").update(salt + password).digest("hex");
}

// Save or retrieve the password hash from Supabase admin_config table
async function getStoredHash(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("admin_config")
      .select("value")
      .eq("key", "admin_password_hash")
      .maybeSingle();
    return (data as { value: string } | null)?.value ?? null;
  } catch { return null; }
}

async function setStoredHash(hash: string): Promise<boolean> {
  const { error } = await supabase.from("admin_config").upsert(
    { key: "admin_password_hash", value: hash, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  return !error;
}

// POST /api/admin/password — change the admin password
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json().catch(() => ({})) as Record<string, string>;

  if (!currentPassword || !newPassword) {
    return Response.json({ error: "Both current and new password are required." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  // Verify current password against stored hash OR env var fallback
  const storedHash = await getStoredHash();
  const envPassword = process.env.ADMIN_PASSWORD ?? "";
  let currentOk = false;

  if (storedHash) {
    const candidateHash = hashPassword(currentPassword);
    try {
      currentOk = timingSafeEqual(Buffer.from(candidateHash), Buffer.from(storedHash));
    } catch { currentOk = false; }
  } else {
    // Fall back to env var
    try {
      const ab = Buffer.from(currentPassword);
      const bb = Buffer.from(envPassword);
      if (ab.length === bb.length) currentOk = timingSafeEqual(ab, bb);
    } catch { currentOk = false; }
  }

  if (!currentOk) {
    return Response.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const newHash = hashPassword(newPassword);
  const saved = await setStoredHash(newHash);

  if (!saved) {
    return Response.json({
      error: "Could not save password. Run this SQL in Supabase first:\n\nCREATE TABLE IF NOT EXISTS admin_config (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz DEFAULT now());"
    }, { status: 500 });
  }

  return Response.json({ success: true });
}
