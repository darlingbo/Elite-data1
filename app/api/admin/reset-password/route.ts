import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { resetToken, newPassword } = await request.json();

  if (!resetToken || !newPassword) {
    return Response.json({ error: "Reset token and new password are required." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  // Verify the reset token matches ADMIN_SESSION_TOKEN — only the real admin knows this
  const sessionToken = process.env.ADMIN_SESSION_TOKEN ?? "";
  if (!sessionToken || resetToken.trim() !== sessionToken.trim()) {
    return Response.json({ error: "Invalid reset token. Check your Vercel environment variables for ADMIN_SESSION_TOKEN." }, { status: 403 });
  }

  // Hash the new password the same way the auth route does
  const salt = sessionToken || "elite-data-salt";
  const newHash = createHash("sha256").update(salt + newPassword).digest("hex");

  // Try to save to system_settings table
  const { error } = await supabase
    .from("system_settings")
    .upsert({ key: "admin_password_hash", value: newHash }, { onConflict: "key" });

  if (error) {
    // Table doesn't exist yet — return instructions to create it
    if (error.code === "42P01") {
      return Response.json({
        error: "The system_settings table does not exist yet. Run this SQL in your Supabase SQL editor first:\n\nCREATE TABLE IF NOT EXISTS system_settings (key text PRIMARY KEY, value text NOT NULL);\n\nThen try again.",
        sqlNeeded: true,
        sql: "CREATE TABLE IF NOT EXISTS system_settings (\n  key text PRIMARY KEY,\n  value text NOT NULL\n);",
      }, { status: 500 });
    }
    return Response.json({ error: "Database error: " + error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
