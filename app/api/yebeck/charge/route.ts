import { NextRequest } from "next/server";
import { startYebeckCharge } from "@/lib/yebeck-charge";
import { normalizeGhPhone } from "@/lib/phone";
import { toMinorUnits } from "@/lib/finance";
import type { YebeckNetwork } from "@/lib/yebeck";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, phone, network, type, reference, name, metadata } = body;

    const normalizedPhone = normalizeGhPhone(String(phone ?? ""));
    if (!normalizedPhone) {
      return Response.json(
        { ok: false, message: "Please provide a valid 10-digit Ghana phone number." },
        { status: 400 },
      );
    }

    const net = String(network ?? "").toLowerCase();
    const validNetworks: Record<string, YebeckNetwork> = {
      mtn: "mtn",
      telecel: "telecel",
      vod: "telecel",
      at: "at",
      airteltigo: "at",
      tgo: "at",
    };
    const mappedNet = validNetworks[net];
    if (!mappedNet) {
      return Response.json(
        { ok: false, message: "Invalid network selected. Choose MTN, Telecel, or AirtelTigo." },
        { status: 400 },
      );
    }

    const amountGhc = Number(amount);
    if (!Number.isFinite(amountGhc) || amountGhc <= 0) {
      return Response.json(
        { ok: false, message: "Invalid payment amount." },
        { status: 400 },
      );
    }

    const amountPesewas = toMinorUnits(amountGhc);
    const ref = reference || `YBK-${Math.floor(100000 + Math.random() * 900000)}`;

    const res = await startYebeckCharge({
      amountPesewas,
      reference: ref,
      type: type || "data_order",
      payerPhone: normalizedPhone,
      provider: mappedNet,
      customerName: name ? String(name) : undefined,
      metadata: metadata || {},
    });

    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (err) {
    return Response.json(
      { ok: false, message: err instanceof Error ? err.message : "Failed to initiate payment." },
      { status: 500 },
    );
  }
}

