import { NextRequest } from "next/server";
import { startYebeckCharge } from "@/lib/yebeck-charge";
import { normalizeGhPhone, detectGhProvider } from "@/lib/phone";
import { toMinorUnits } from "@/lib/finance";
import type { YebeckNetwork } from "@/lib/yebeck";
import { getStoreStatus } from "@/lib/store-status";
import { rateLimitDb } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { lookupBundleNetwork } from "@/lib/bundle-lookup";
import { checkNumber, getNumberCheckSettings, NOT_VERIFIED_MESSAGE, UNREACHABLE_MESSAGE } from "@/lib/number-check";

const NETWORK_LABEL: Record<YebeckNetwork, string> = { mtn: "MTN MoMo", telecel: "Telecel Cash", at: "AirtelTigo Money" };

export async function POST(request: NextRequest) {
  // Admin "Close Store" switch: no new payment prompts while closed. A page that
  // was already open before closing could otherwise still start a charge.
  const store = await getStoreStatus();
  if (!store.open) {
    return Response.json({ ok: false, message: store.message }, { status: 503 });
  }

  const ip = clientIp(request);
  if (await rateLimitDb(`momo-charge-ip:${ip}`, 15, 10 * 60_000)) {
    return Response.json({ ok: false, message: "Too many payment requests. Please wait a few minutes and try again." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { amount, phone, network, type, reference, name, metadata, confirmNetwork } = body;

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
        { ok: false, message: "Choose your Mobile Money network: MTN MoMo, Telecel Cash or AirtelTigo Money." },
        { status: 400 },
      );
    }

    // One phone can only start a few prompts in a short time.
    if (await rateLimitDb(`momo-charge-phone:${normalizedPhone}`, 6, 10 * 60_000)) {
      return Response.json({ ok: false, message: "Too many payment requests for this number. Please wait a few minutes." }, { status: 429 });
    }

    // The payer chooses their own network. If the number's prefix says it is on a
    // different network (ported numbers exist), the customer must confirm first.
    const detected = detectGhProvider(normalizedPhone);
    if (detected && detected !== mappedNet && confirmNetwork !== true) {
      return Response.json(
        {
          ok: false,
          code: "network_mismatch",
          message: `This number looks like a ${NETWORK_LABEL[detected]} number. Choose ${NETWORK_LABEL[detected]}, or confirm that it is on ${NETWORK_LABEL[mappedNet]}.`,
        },
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

    // Number check on the server, so skipping the page cannot skip the check.
    // Only MTN data orders have a beneficiary list.
    const orderType = type || "data_order";
    if (!["data_order", "voucher_order", "bulk_order", "topup"].includes(orderType)) {
      return Response.json({ ok: false, message: "Unknown payment type." }, { status: 400 });
    }
    const meta = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
    if (orderType === "data_order" && meta.recipient_phone && meta.bundle_id) {
      const bundleNetwork = await lookupBundleNetwork(String(meta.bundle_id));
      if (bundleNetwork === "mtn") {
        const outcome = await checkNumber(String(meta.recipient_phone), { network: "mtn", ip });
        if (!outcome.allowed) {
          const settings = await getNumberCheckSettings();
          return Response.json(
            outcome.status === "not_verified"
              ? { ok: false, code: "number_not_verified", message: NOT_VERIFIED_MESSAGE, verifyUrl: settings.verifyUrl || null }
              : { ok: false, code: "number_check_unreachable", message: UNREACHABLE_MESSAGE },
            { status: 403 },
          );
        }
      }
    }

    const amountPesewas = toMinorUnits(amountGhc);
    const ref = reference || `YBK-${Math.floor(100000 + Math.random() * 900000)}`;

    const res = await startYebeckCharge({
      amountPesewas,
      reference: ref,
      type: orderType,
      payerPhone: normalizedPhone,
      provider: mappedNet,
      customerName: name ? String(name) : undefined,
      metadata: meta,
    });

    return Response.json(res, { status: res.ok ? 200 : 400 });
  } catch (err) {
    console.error("[yebeck/charge] failed", err instanceof Error ? err.message : String(err));
    return Response.json(
      { ok: false, message: "We could not start the payment. Please try again." },
      { status: 500 },
    );
  }
}
