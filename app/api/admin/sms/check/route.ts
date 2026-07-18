import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  const senderId = process.env.AT_SENDER_ID ?? "";

  if (!apiKey || !username) {
    return Response.json({
      configured: false,
      error: "AT_API_KEY or AT_USERNAME is missing from environment variables.",
    });
  }

  try {
    const res = await fetch(`https://api.africastalking.com/version1/user?username=${encodeURIComponent(username)}`, {
      headers: { apiKey, Accept: "application/json" },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* ignore */ }

    const userdata = (data.UserData as Record<string, unknown>) ?? {};
    const balance  = userdata.balance as string ?? null;

    return Response.json({
      configured: true,
      username,
      isSandbox: username === "sandbox",
      senderId: senderId || null,
      balance,
      atStatus: res.status,
      raw: data,
    });
  } catch (err) {
    return Response.json({ configured: true, username, error: String(err) });
  }
}
