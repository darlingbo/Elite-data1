import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getRoutingRules, saveRoutingRules, type RoutingRule } from "@/lib/phone-routing";

async function isAdmin() {
  const c = await cookies();
  return c.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!await isAdmin()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ rules: await getRoutingRules() });
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { match, provider, label } = await req.json();
  if (!match || !provider) return Response.json({ error: "match and provider are required" }, { status: 400 });

  const rules = await getRoutingRules();
  const rule: RoutingRule = {
    id: crypto.randomUUID(),
    match: String(match).trim().replace(/\s/g, ""),
    provider,
    label: label ? String(label).trim() : undefined,
  };
  rules.push(rule);
  await saveRoutingRules(rules);
  return Response.json({ success: true, rules });
}

export async function DELETE(req: NextRequest) {
  if (!await isAdmin()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  const rules = await getRoutingRules();
  await saveRoutingRules(rules.filter(r => r.id !== id));
  return Response.json({ success: true });
}
