/*
  SQL to run once in Supabase:

  create table referral_credits (
    id uuid default gen_random_uuid() primary key,
    phone text not null,
    credit_ghc numeric not null default 1.00,
    used boolean default false,
    used_at timestamptz,
    used_on_reference text,
    from_phone text,
    created_at timestamptz default now()
  );
  create index on referral_credits(phone, used);

  create table loyalty_sessions (
    id uuid default gen_random_uuid() primary key,
    phone text not null,
    window_start timestamptz not null,
    window_end timestamptz not null,
    bundle_count int default 1,
    rewarded boolean default false,
    reward_reference text,
    reward_network text,
    created_at timestamptz default now()
  );
  create index on loyalty_sessions(phone, window_end, rewarded);
*/

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone");
  if (!phone) return Response.json({ credits: 0 });

  const [creditResult, milestoneResult, epochCountResult] = await Promise.all([
    supabase.from("referral_credits").select("id, credit_ghc").eq("phone", phone).eq("used", false)
      .not("from_phone", "like", "MILESTONE:%").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("referral_credits").select("from_phone").eq("phone", phone).eq("used", false)
      .like("from_phone", "MILESTONE:%").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("referral_credits").select("id", { count: "exact", head: true }).eq("phone", phone)
      .not("from_phone", "like", "MILESTONE:%"),
  ]);

  const { data } = creditResult;
  const totalUses = epochCountResult.count ?? 0;
  const epochPos = totalUses % 10;
  const usesLeft = epochPos === 0 && totalUses > 0 ? 10 : 10 - epochPos;

  let milestoneCode: string | null = null;
  if (milestoneResult.data) {
    const code = (milestoneResult.data.from_phone as string).replace("MILESTONE:", "");
    try {
      const { data: promoOk } = await supabase.from("promo_codes").select("code")
        .eq("code", code).eq("active", true).maybeSingle();
      if (promoOk) milestoneCode = promoOk.code;
    } catch { /* promo_codes table may not exist */ }
  }

  return Response.json({
    credits: data ? Number(data.credit_ghc) : 0,
    id: data?.id ?? null,
    milestoneCode,
    usesLeft,
    totalUses,
  });
}
