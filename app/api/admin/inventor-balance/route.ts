import { cookies } from "next/headers";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/balance`, {
      headers: { Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json({ balance: null, error: `API error ${res.status}` });
    }

    const data = await res.json();

    // Handle different response shapes from Inventor DataHub
    const raw =
      data?.balance ??
      data?.data?.balance ??
      data?.wallet_balance ??
      data?.data?.wallet_balance ??
      data?.amount ??
      data?.data?.amount ??
      null;

    const balance = raw !== null ? Number(raw) : null;
    return Response.json({ balance, raw: data });
  } catch (err) {
    return Response.json({ balance: null, error: String(err) });
  }
}
