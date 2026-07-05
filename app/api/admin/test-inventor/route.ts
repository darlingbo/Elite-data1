import { cookies } from "next/headers";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

// Fetches available plans from Inventor so we can see exactly what network names
// and data sizes are accepted. Visit /api/admin/test-inventor in browser (logged in as admin).
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.INVENTOR_API_BASE_URL;
  const key  = process.env.INVENTOR_API_KEY;

  if (!base || !key) return Response.json({ error: "INVENTOR_API_BASE_URL or INVENTOR_API_KEY not set" }, { status: 500 });

  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Try known Inventor endpoints to discover available plans
  const endpoints = [
    "/api/developer/plans",
    "/api/developer/bundles",
    "/api/developer/networks",
    "/api/developer/data-plans",
    "/api/plans",
    "/api/bundles",
  ];

  const results: Record<string, unknown> = {};

  await Promise.all(endpoints.map(async ep => {
    try {
      const r = await fetch(`${base}${ep}`, { headers });
      const text = await r.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }
      results[ep] = { status: r.status, body };
    } catch (e) {
      results[ep] = { error: String(e) };
    }
  }));

  return Response.json({ base, results });
}
