import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { inventorVerifyNumber } from "@/lib/inventor";

async function isAdmin() {
  const s = await cookies();
  return verifyAdminSessionValue(s.get("admin_session")?.value);
}

// Ghana MTN mobile prefixes.
const MTN_PREFIXES = ["024", "025", "053", "054", "055", "059"];

function normalise(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return digits;
  if (/^233\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}

/** GET — every distinct MTN number that has ordered from us, plus any
 * added by hand (leads not yet ordered, tracked in mtn_watch_numbers). */
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: orders }, { data: watched }] = await Promise.all([
    supabase.from("orders").select("phone, created_at").neq("network", "voucher").not("phone", "is", null),
    supabase.from("mtn_watch_numbers").select("phone, added_at"),
  ]);

  const byPhone = new Map<string, { orders: number; lastOrder: string; addedManually: boolean }>();
  for (const o of orders ?? []) {
    const phone = normalise(o.phone as string);
    if (!phone || !MTN_PREFIXES.includes(phone.slice(0, 3))) continue;
    const entry = byPhone.get(phone) ?? { orders: 0, lastOrder: o.created_at as string, addedManually: false };
    entry.orders++;
    if ((o.created_at as string) > entry.lastOrder) entry.lastOrder = o.created_at as string;
    byPhone.set(phone, entry);
  }
  for (const w of watched ?? []) {
    const phone = normalise(w.phone as string);
    if (!phone || !MTN_PREFIXES.includes(phone.slice(0, 3))) continue;
    if (!byPhone.has(phone)) {
      byPhone.set(phone, { orders: 0, lastOrder: w.added_at as string, addedManually: true });
    }
  }

  const numbers = [...byPhone.entries()]
    .map(([phone, v]) => ({ phone, orders: v.orders, lastOrder: v.lastOrder, addedManually: v.addedManually }))
    .sort((a, b) => (a.lastOrder < b.lastOrder ? 1 : -1));

  return Response.json({ numbers, total: numbers.length });
}

/** PUT { phone, note? } — add a number by hand (a lead, not yet a customer)
 * so it shows up here and can be checked/tracked before their first order. */
export async function PUT(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const phone = normalise(String(body?.phone ?? ""));
  if (!phone) return Response.json({ error: "Enter a valid 10-digit Ghana number, e.g. 0241234567." }, { status: 400 });
  if (!MTN_PREFIXES.includes(phone.slice(0, 3))) {
    return Response.json({ error: `${phone} isn't an MTN prefix — this list is MTN-only.` }, { status: 400 });
  }

  const { error } = await supabase
    .from("mtn_watch_numbers")
    .upsert({ phone, note: body?.note ?? null }, { onConflict: "phone" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, phone });
}

/** POST { phones: string[] } — check current MTN beneficiary status for a
 * batch, straight against the real supplier (Inventor), not cached. Capped
 * per call so one request can't tie up the function for too long. */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const phones = Array.isArray(body?.phones) ? body.phones.slice(0, 60) : [];
  if (phones.length === 0) return Response.json({ error: "phones array required (max 60 per call)" }, { status: 400 });

  const CONCURRENCY = 8;
  const results: { phone: string; verified: boolean }[] = [];
  let idx = 0;
  async function worker() {
    while (idx < phones.length) {
      const phone = phones[idx++];
      const { verified } = await inventorVerifyNumber(String(phone));
      results.push({ phone, verified });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, phones.length) }, worker));

  return Response.json({ results });
}
