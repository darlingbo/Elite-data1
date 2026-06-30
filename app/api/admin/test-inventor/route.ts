import { cookies } from "next/headers";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.INVENTOR_API_BASE_URL;
  const key = process.env.INVENTOR_API_KEY;

  if (!base || !key) return Response.json({ error: "Inventor env vars missing", base: !!base, key: !!key });

  // 1. Try to get available plans/networks
  const results: Record<string, unknown> = {};

  try {
    const plansRes = await fetch(`${base}/api/developer/get-plans`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    results.plans = { status: plansRes.status, body: await plansRes.json().catch(() => plansRes.text()) };
  } catch (e) { results.plans = { error: String(e) }; }

  try {
    const networksRes = await fetch(`${base}/api/developer/networks`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    results.networks = { status: networksRes.status, body: await networksRes.json().catch(() => networksRes.text()) };
  } catch (e) { results.networks = { error: String(e) }; }

  try {
    const rootRes = await fetch(`${base}/api/developer`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    results.root = { status: rootRes.status, body: await rootRes.json().catch(() => rootRes.text()) };
  } catch (e) { results.root = { error: String(e) }; }

  return Response.json({ base, results });
}
