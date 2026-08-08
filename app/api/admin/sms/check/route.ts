import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { africasTalkingBaseUrl, africasTalkingUsernames, cleanAfricasTalkingApiKey, isAfricasTalkingAuthError } from "@/lib/sms";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = cleanAfricasTalkingApiKey();
  const usernames = africasTalkingUsernames();
  const configuredSenderId = process.env.AT_SENDER_ID ?? "";
  const senderIdEnabled = process.env.AT_SENDER_ID_ENABLED === "1";

  if (!apiKey || usernames.length === 0) {
    return Response.json({
      configured: false,
      error: "AT_API_KEY or AT_USERNAME is missing from environment variables.",
    });
  }

  try {
    let username = usernames[0];
    let res: Response | null = null;
    let data: Record<string, unknown> = {};
    for (const candidate of usernames) {
      username = candidate;
      res = await fetch(`${africasTalkingBaseUrl(username)}/version1/user?username=${encodeURIComponent(username)}`, {
        headers: { apiKey: apiKey.trim(), Accept: "application/json" },
      });
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      const message = String(data.errorMessage ?? data.error ?? text);
      if (isAfricasTalkingAuthError(res.status, message)) continue;
      break;
    }

    const userdata = (data.UserData as Record<string, unknown>) ?? {};
    const balance  = userdata.balance as string ?? null;

    if (!res?.ok || !balance) {
      const providerMessage = String(data.errorMessage ?? data.error ?? "Authentication failed");
      const authFailed = isAfricasTalkingAuthError(res?.status ?? 500, providerMessage);
      return Response.json({
        configured: true,
        username,
        isSandbox: username === "sandbox",
        atStatus: res?.status ?? 500,
        error: authFailed
          ? "AT_USERNAME and AT_API_KEY do not match. Use the exact application username and API key from the same Africa's Talking environment."
          : providerMessage,
      });
    }

    return Response.json({
      configured: true,
      username,
      isSandbox: username === "sandbox",
      senderId: senderIdEnabled ? (configuredSenderId || null) : null,
      configuredSenderId: configuredSenderId || null,
      senderIdEnabled,
      balance,
      atStatus: res?.status ?? 500,
      raw: data,
    });
  } catch (err) {
    return Response.json({ configured: true, username: usernames[0], error: String(err) });
  }
}
