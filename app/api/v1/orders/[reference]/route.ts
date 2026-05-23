import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { reference } = await params;
  const { data, error } = await supabase
    .from("orders")
    .select("reference, status, network, bundle_size, phone, amount, created_at")
    .eq("reference", decodeURIComponent(reference))
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  return NextResponse.json({ order: data });
}
