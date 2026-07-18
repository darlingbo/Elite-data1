import { NextRequest } from "next/server";
import { isAdmin, verifyAdminPassword, setAdminPassword } from "@/lib/adminAuth";

// POST /api/admin/password — change the admin password (bcrypt, single source of truth).
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newPassword } = (await request.json().catch(() => ({}))) as Record<string, string>;

  if (!currentPassword || !newPassword) {
    return Response.json({ error: "Both current and new password are required." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  if (!(await verifyAdminPassword(currentPassword))) {
    return Response.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const saved = await setAdminPassword(newPassword);
  if (!saved) {
    return Response.json({
      error:
        "Could not save password. Run this SQL in Supabase first:\n\nCREATE TABLE IF NOT EXISTS admin_config (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz DEFAULT now());",
    }, { status: 500 });
  }

  return Response.json({ success: true });
}
