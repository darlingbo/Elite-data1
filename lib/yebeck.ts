import { toMinorUnits } from "@/lib/finance";

const YEBECK_BASE = "https://api.yebeck.com/api/v1";

function apiKey(): string {
  const key = process.env.YEBECK_API_KEY;
  if (!key) throw new Error("YEBECK_API_KEY is not set in environment variables");
  return key;
}

export type YebeckNetwork = "mtn" | "telecel" | "at";

export type YebeckCollection = {
  reference: string;
  status: "pending" | "successful" | "failed" | "reversed" | string;
  amount: number;
  fee?: number;
  network?: YebeckNetwork;
  is_test?: boolean;
  message?: string;
  created_at?: string;
};

type YebeckEnvelope = {
  success?: boolean;
  message?: string;
  data?: YebeckCollection;
};

export class YebeckApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "YebeckApiError";
  }
}

async function request(path: string, init?: RequestInit): Promise<YebeckCollection> {
  const response = await fetch(`${YEBECK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(init?.headers ?? {}),
      ...(init?.method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });

  const envelope = (await response.json().catch(() => ({}))) as YebeckEnvelope;
  if (!response.ok || envelope.success !== true || !envelope.data) {
    console.error("Yebeck API returned an unsuccessful response", {
      status: response.status,
      successFlag: envelope.success === true,
      hasData: Boolean(envelope.data),
    });
    throw new YebeckApiError(
      response.status,
      envelope.message || `Yebeck request failed (${response.status})`,
    );
  }
  return { ...envelope.data, message: envelope.message };
}

export async function createCollection(params: {
  amountPesewas: number;
  network: YebeckNetwork;
  customerMsisdn: string;
  customerName?: string;
  narration?: string;
}): Promise<YebeckCollection> {
  if (!Number.isSafeInteger(params.amountPesewas) || params.amountPesewas <= 0) {
    throw new Error("Collection amount must be a positive integer number of pesewas.");
  }

  const amount = Number((params.amountPesewas / 100).toFixed(2));
  return request("/collections", {
    method: "POST",
    body: JSON.stringify({
      amount,
      network: params.network,
      customer_msisdn: params.customerMsisdn,
      ...(params.customerName ? { customer_name: params.customerName } : {}),
      ...(params.narration ? { narration: params.narration } : {}),
    }),
  });
}

export async function getCollection(reference: string): Promise<YebeckCollection> {
  return request(`/collections/${encodeURIComponent(reference)}`);
}

export function yebeckAmountToPesewas(amount: number): number {
  return toMinorUnits(amount);
}

export function matchesYebeckCollectionAmount(
  expectedPesewas: number,
  collection: YebeckCollection,
): boolean {
  const amountPesewas = yebeckAmountToPesewas(collection.amount);
  if (amountPesewas === expectedPesewas) return true;
  if (typeof collection.fee !== "number" || !Number.isFinite(collection.fee)) return false;

  const feePesewas = yebeckAmountToPesewas(collection.fee);
  return feePesewas > 0 && amountPesewas - feePesewas === expectedPesewas;
}

export function normalizeCollectionStatus(status: string): "success" | "pending" | "failed" {
  if (status === "successful") return "success";
  if (status === "failed" || status === "reversed") return "failed";
  return "pending";
}

