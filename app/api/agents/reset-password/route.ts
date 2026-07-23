import { NextRequest } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { rateLimitDb } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`agent-password-reset-confirm:${ip}`, 5, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { token, password } = await request.json().catch(() => ({})) as {
    token?: string;
    password?: string;
  };
  if (!token || !password || password.length < 8) {
    return Response.json({ error: "A valid token and password of at least 8 characters are required." }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const passwordHash = await bcrypt.hash(password, 12);
  const { data: changed, error } = await supabase.rpc("consume_agent_password_reset", {
    p_token_hash: tokenHash,
    p_password_hash: passwordHash,
  });
  if (error) {
    return Response.json({ error: "Could not update the password." }, { status: 500 });
  }
  if (!changed) return Response.json({ error: "This reset link is invalid, expired, or already used." }, { status: 400 });

  return Response.json({ success: true });
}
