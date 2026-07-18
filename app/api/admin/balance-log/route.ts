/*
  SQL — run once in Supabase:

  create table api_ledger (
    id uuid default gen_random_uuid() primary key,
    type text not null,           -- 'snapshot' | 'deposit' | 'deduction'
    amount numeric not null,
    balance_after numeric,        -- running balance at this point
    note text,
    order_reference text,
    recorded_at timestamptz default now()
  );
  create index on api_ledger(recorded_at desc);
  create index on api_ledger(type);
  create index on api_ledger(order_reference);
*/

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

// GET — fetch recent ledger entries
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("api_ledger")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entries: data ?? [] });
}

// POST — record a snapshot or deposit
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { type, amount, note, balance_after } = await request.json();
  if (!["snapshot", "deposit"].includes(type)) {
    return Response.json({ error: "type must be snapshot or deposit" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("api_ledger")
    .insert({
      type,
      amount: Number(amount) || 0,
      balance_after: balance_after !== undefined ? Number(balance_after) : null,
      note: note ?? null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entry: data });
}
