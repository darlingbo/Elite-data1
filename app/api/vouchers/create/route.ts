import { NextRequest } from "next/server";
import { createPaidVoucherOrder } from "@/lib/voucher-create";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  return createPaidVoucherOrder(body);
}
