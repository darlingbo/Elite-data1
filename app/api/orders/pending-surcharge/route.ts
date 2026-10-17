import { NextRequest } from "next/server";
import { getSurcharge } from "@/lib/surcharge";
import { tooMany } from "@/lib/public-limit";

export async function GET(req: NextRequest) {
  const blocked = await tooMany(req, "pending-surcharge", 30, 60000);
  if (blocked) return blocked;

  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  if (!phone) return Response.json({ surcharge: 0 });
  const surcharge = await getSurcharge(phone);
  return Response.json({ surcharge });
}
