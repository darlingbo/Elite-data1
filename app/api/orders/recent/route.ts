import { supabase } from "@/lib/supabase";

function maskPhone(phone: string): string {
  const p = phone.replace(/\s/g, "");
  if (p.length < 6) return p;
  return p.slice(0, 3) + "****" + p.slice(-2);
}

export async function GET() {
  const { data } = await supabase
    .from("orders")
    .select("phone, network, bundle_size, created_at")
    .eq("status", "completed")
    .not("network", "is", null)
    .not("bundle_size", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const orders = (data ?? []).map((o) => ({
    phone: maskPhone(o.phone ?? ""),
    network: o.network as string,
    bundle_size: o.bundle_size as string,
    created_at: o.created_at as string,
  }));

  return Response.json({ orders });
}
