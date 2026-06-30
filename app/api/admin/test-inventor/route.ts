import { cookies } from "next/headers";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

async function tryNetwork(base: string, key: string, networkName: string) {
  try {
    const res = await fetch(`${base}/api/developer/purchase`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        network: networkName,
        Phone: "0200000000",
        Datasize: 1,
        reference: `test-at-${networkName.replace(/\s/g, "-").toLowerCase()}-${Date.now()}`,
      }),
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: res.status, body };
  } catch (e) { return { error: String(e) }; }
}

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.INVENTOR_API_BASE_URL?.replace(/\/$/, "");
  const key = process.env.INVENTOR_API_KEY;
  if (!base || !key) return Response.json({ error: "Inventor env vars missing" });

  // Try all known AirtelTigo network name variations
  const variants = ["AT ISHARE", "AT", "AIRTELTIGO", "AIRTEL", "TIGO", "AT_ISHARE", "at ishare"];

  const results: Record<string, unknown> = {};
  for (const name of variants) {
    results[name] = await tryNetwork(base, key, name);
  }

  return Response.json({ base, results });
}
