import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { rateLimitDb } from "@/lib/rate-limit";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`agent-password-reset:${ip}`, 3, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, email")
    .eq("email", email)
    .eq("status", "approved")
    .maybeSingle();

  // Always return the same response to prevent account enumeration.
  if (agent && process.env.RESEND_API_KEY) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await supabase.from("agent_password_reset_tokens")
      .delete().eq("agent_id", agent.id).is("used_at", null);
    const { error: tokenError } = await supabase.from("agent_password_reset_tokens").insert({
      agent_id: agent.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (!tokenError) {
      const siteUrl = process.env.SITE_URL ?? "https://www.elitedata1.com";
      const resetUrl = `${siteUrl}/agent/reset-password?token=${encodeURIComponent(token)}`;
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.PASSWORD_RESET_FROM_EMAIL ?? "Elite Data <noreply@elitedata1.com>",
          to: [agent.email],
          subject: "Reset your Elite Data agent password",
          html: `<p>Hello ${escapeHtml(agent.name)},</p><p>Use the secure link below to reset your password. It expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!emailResponse?.ok) {
        await supabase.from("agent_password_reset_tokens").delete().eq("token_hash", tokenHash);
      }
    }
  }

  return Response.json({
    success: true,
    show: false,
    message: "If that account exists, a password-reset link has been sent.",
  });
}
