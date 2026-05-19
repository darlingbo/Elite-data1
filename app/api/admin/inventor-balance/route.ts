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
      headers: {
        Authorization: `Bearer ${process.env.INVENTOR_API_KEY}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json({ balance: null, error: "Could not fetch balance" });
    }

    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ balance: null, error: "Could not fetch balance" });
  }
}
