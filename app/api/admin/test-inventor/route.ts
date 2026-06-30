import { cookies } from "next/headers";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function probe(url: string, key: string, method = "GET", body?: object) {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  } catch (e) { return { error: String(e) }; }
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.INVENTOR_API_BASE_URL?.replace(/\/$/, "");
  const key = process.env.INVENTOR_API_KEY;
  if (!base || !key) return Response.json({ error: "Inventor env vars missing" });

  const [plans, bundles, data, profile] = await Promise.all([
    probe(`${base}/api/developer/get-plans`, key),
    probe(`${base}/api/developer/bundles`, key),
    probe(`${base}/api/developer/data-plans`, key),
    probe(`${base}/api/developer/profile`, key),
  ]);

  return Response.json({ base, plans, bundles, data, profile });
}
