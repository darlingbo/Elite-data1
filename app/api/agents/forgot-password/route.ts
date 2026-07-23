import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Never change or disclose a password based only on knowledge of an email
  // address. Until verified email reset links are implemented, recovery is
  // handled by the administrator after identity verification.
  return Response.json({
    success: true,
    show: false,
    message: "For security, contact the administrator to recover your account.",
  });
}
