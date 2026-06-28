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
    return Response.json({ error: "Invalid reset token. Check your Vercel/Render environment variables." }, { status: 403 });
  }

  // Hash the new password the same way the auth route does
  const salt = process.env.ADMIN_SESSION_TOKEN ?? "elite-data-salt";
  const newHash = createHash("sha256").update(salt + newPassword).digest("hex");

  // Save to system_settings (creates row if not exists)
  const { error } = await supabase
    .from("system_settings")
    .upsert({ key: "admin_password_hash", value: newHash }, { onConflict: "key" });

  if (error) {
    // Table might not exist yet — ignore and retry the upsert anyway
    const { error: err2 } = await supabase
      .from("system_settings")
      .upsert({ key: "admin_password_hash", value: newHash }, { onConflict: "key" });

    if (err2) {
      return Response.json({ error: "Could not save to database: " + err2.message }, { status: 500 });
    }
  }

  return Response.json({ success: true });
}
