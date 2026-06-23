import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

function generateTempPassword(): string {
  // Easy to read/type: only digits and clear uppercase letters
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, status")
    .eq("email", email)
    .maybeSingle();

  if (!agent || agent.status === "rejected") {
    // Generic response to prevent email enumeration
    return Response.json({ success: true, show: false, message: "If that email is registered, a new password has been created. Check below." });
  }

  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, 10);

  const { error } = await supabase
    .from("agents")
    .update({ password_hash })
    .eq("id", agent.id);

  if (error) {
    return Response.json({ error: "Could not reset password. Please contact admin on WhatsApp." }, { status: 500 });
  }

  // Return the new password directly — agent sees it on screen immediately
  return Response.json({
    success: true,
    show: true,
    tempPassword,
    message: `Your new temporary password is shown below. Log in and change it in your profile settings.`,
  });
}
