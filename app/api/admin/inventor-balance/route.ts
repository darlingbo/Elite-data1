import { cookies } from "next/headers";
import { inventorBalance } from "@/lib/inventor";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const balance = await inventorBalance();

  if (balance === null) {
    return Response.json({ balance: null, error: "Could not fetch balance from Inventor API" });
  }

  return Response.json({ balance });
}
