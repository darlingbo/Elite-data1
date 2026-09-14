import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { checkMessagePilotConfig } from "@/lib/sms";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const result = checkMessagePilotConfig();
  return Response.json(result);
}
