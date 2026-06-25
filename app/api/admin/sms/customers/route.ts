import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_session")?.value === process.env.ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("phone")
    .not("phone", "is", null);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const phones = (data ?? []).map((o: { phone: string }) => o.phone).filter((p): p is string => !!p);
  const unique = [...new Set(phones)];

  return Response.json({ phones: unique, count: unique.length });
}
