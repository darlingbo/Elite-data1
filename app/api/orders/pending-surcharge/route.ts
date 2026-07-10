import { NextRequest } from "next/server";
import { getSurcharge } from "@/lib/surcharge";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  if (!phone) return Response.json({ surcharge: 0 });
  const surcharge = await getSurcharge(phone);
  return Response.json({ surcharge });
}
