import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminSessionValue(store.get("admin_session")?.value);
}

export async function POST() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(
    {
      error: "Order retry is disabled by Elite Data Safe Mode. Check the provider status and complete the order manually to prevent duplicate charges.",
      safeMode: true,
      retryAllowed: false,
    },
    { status: 403 },
  );
}
