import { cookies } from "next/headers";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = process.env.INVENTOR_API_BASE_URL ?? "";
  const key  = process.env.INVENTOR_API_KEY ?? "";
  const authHeader = { Authorization: `Bearer ${key}` };

  const { searchParams } = new URL(req.url);
  const discoverPlans = searchParams.get("plans") === "1";

  try {
    const res = await fetch(`${base}/api/developer/balance`, {
      headers: authHeader,
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json({ balance: null, error: `API error ${res.status}` });
    }

    const data = await res.json();

    const raw =
      data?.balance ??
      data?.data?.balance ??
      data?.wallet_balance ??
      data?.data?.wallet_balance ??
      data?.amount ??
      data?.data?.amount ??
      null;

    const balance = raw !== null ? Number(raw) : null;

    // Optional: pass ?plans=1 to also probe available plan endpoints
    if (discoverPlans) {
      const planEndpoints = [
        "/api/developer/plans",
        "/api/developer/bundles",
        "/api/developer/networks",
        "/api/developer/data-plans",
        "/api/plans",
        "/api/bundles",
      ];
      const planResults: Record<string, unknown> = {};
      await Promise.all(planEndpoints.map(async (ep) => {
        try {
          const r = await fetch(`${base}${ep}`, { headers: authHeader, cache: "no-store" });
          let body: unknown;
          try { body = await r.json(); } catch (e) { body = String(e); }
          planResults[ep] = { status: r.status, body };
        } catch (e) {
          planResults[ep] = { error: String(e) };
        }
      }));
      return Response.json({ balance, raw: data, plans: planResults });
    }

    return Response.json({ balance, raw: data });
  } catch (err) {
    return Response.json({ balance: null, error: String(err) });
  }
}
