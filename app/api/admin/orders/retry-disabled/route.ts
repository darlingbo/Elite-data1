import { cookies } from "next/headers";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

export async function POST() {
  const store = await cookies();
  if (!verifyAdminSessionValue(store.get("admin_session")?.value)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(
    {
      error: "Order retry is disabled by Elite Data Safe Mode. Review the provider status and process the order manually to prevent duplicate charges.",
      safeMode: true,
    },
    { status: 403 },
  );
}
