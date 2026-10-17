import { NextRequest } from "next/server";
import { rateLimitDb } from "@/lib/rate-limit";
import { createPaidOrder } from "@/lib/order-create";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Rate limit: 10 order attempts per IP per minute
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await rateLimitDb(`orders:${ip}`, 10, 60_000)) {
    return Response.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  return createPaidOrder(body);
}
