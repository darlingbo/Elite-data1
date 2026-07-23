import { NextRequest } from "next/server";
import { verifyResetToken, setAdminPassword } from "@/lib/adminAuth";
import { rateLimitDb } from "@/lib/rate-limit";

// POST /api/admin/reset-password — reset the admin password using the reset token
// (which must equal ADMIN_SESSION_TOKEN). Writes the SAME bcrypt hash that the
// login route reads, so a reset actually takes effect (previously it wrote to a
// different table than login read from).
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`admin-password-reset:${ip}`, 3, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many reset attempts. Try again later." }, { status: 429 });
  }
  const { resetToken, newPassword } = (await request.json().catch(() => ({}))) as Record<string, string>;

  if (!resetToken || !newPassword) {
    return Response.json({ error: "Reset token and new password are required." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  if (!verifyResetToken(resetToken)) {
    return Response.json(
      { error: "Invalid reset token. Check your environment variables for ADMIN_SESSION_TOKEN." },
      { status: 403 }
    );
  }

  const saved = await setAdminPassword(newPassword);
  if (!saved) {
    return Response.json({
      error:
        "Could not save the new password. Create the admin_config table in Supabase first:\n\nCREATE TABLE IF NOT EXISTS admin_config (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz DEFAULT now());",
      sqlNeeded: true,
      sql: "CREATE TABLE IF NOT EXISTS admin_config (\n  key text PRIMARY KEY,\n  value text NOT NULL,\n  updated_at timestamptz DEFAULT now()\n);",
    }, { status: 500 });
  }

  return Response.json({ success: true });
}
