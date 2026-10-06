import { supabase } from "@/lib/supabase";
import { getCollection, normalizeCollectionStatus, YebeckCollection } from "@/lib/yebeck";

export type StoredPaymentAttempt = {
  reference: string;
  provider_reference?: string;
  amount_pesewas: number;
  status: "pending" | "success" | "failed" | "unknown";
  payment_type: "data_order" | "voucher_order" | "bulk_order" | "topup";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const SYSTEM_SETTINGS_KEY = "yebeck_payment_attempts";

async function getAllAttempts(): Promise<Record<string, StoredPaymentAttempt>> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SYSTEM_SETTINGS_KEY)
    .maybeSingle();

  if (!data?.value) return {};
  try {
    return JSON.parse(data.value) as Record<string, StoredPaymentAttempt>;
  } catch {
    return {};
  }
}

async function saveAllAttempts(attempts: Record<string, StoredPaymentAttempt>): Promise<void> {
  // Prune attempts older than 7 days to keep system_settings light
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const pruned: Record<string, StoredPaymentAttempt> = {};
  for (const [ref, item] of Object.entries(attempts)) {
    const createdTime = new Date(item.created_at).getTime();
    if (!Number.isFinite(createdTime) || now - createdTime < maxAge) {
      pruned[ref] = item;
    }
  }

  await supabase.from("system_settings").upsert(
    {
      key: SYSTEM_SETTINGS_KEY,
      value: JSON.stringify(pruned),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

export async function createPaymentAttempt(params: {
  reference: string;
  paymentType: StoredPaymentAttempt["payment_type"];
  amountPesewas: number;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const attempts = await getAllAttempts();
  const now = new Date().toISOString();
  attempts[params.reference] = {
    reference: params.reference,
    amount_pesewas: params.amountPesewas,
    status: "pending",
    payment_type: params.paymentType,
    metadata: params.metadata,
    created_at: now,
    updated_at: now,
  };
  await saveAllAttempts(attempts);
}

export async function recordYebeckCollection(
  reference: string,
  collection: YebeckCollection,
): Promise<void> {
  const attempts = await getAllAttempts();
  const existing = attempts[reference];
  if (!existing) return;

  const status = normalizeCollectionStatus(collection.status);
  attempts[reference] = {
    ...existing,
    provider_reference: collection.reference,
    status,
    updated_at: new Date().toISOString(),
  };
  await saveAllAttempts(attempts);
}

export async function getPaymentAttempt(reference: string): Promise<StoredPaymentAttempt | null> {
  const attempts = await getAllAttempts();
  if (attempts[reference]) return attempts[reference];
  // Check by provider_reference
  for (const att of Object.values(attempts)) {
    if (att.provider_reference === reference) {
      return att;
    }
  }
  return null;
}

export async function markPaymentAttemptStatus(
  reference: string,
  status: StoredPaymentAttempt["status"],
): Promise<void> {
  const attempts = await getAllAttempts();
  if (!attempts[reference]) return;
  attempts[reference].status = status;
  attempts[reference].updated_at = new Date().toISOString();
  await saveAllAttempts(attempts);
}

export async function verifyYebeckPayment(reference: string): Promise<{
  attempt: StoredPaymentAttempt;
  status: "success" | "pending" | "failed";
  collection?: YebeckCollection;
}> {
  const attempt = await getPaymentAttempt(reference);
  if (!attempt) {
    throw new Error(`Payment attempt not found: ${reference}`);
  }

  if (attempt.status === "success") {
    return { attempt, status: "success" };
  }

  const lookupRef = attempt.provider_reference || attempt.reference;
  const collection = await getCollection(lookupRef);
  const normalizedStatus = normalizeCollectionStatus(collection.status);

  if (normalizedStatus !== attempt.status) {
    await markPaymentAttemptStatus(attempt.reference, normalizedStatus);
    attempt.status = normalizedStatus;
  }

  return { attempt, status: normalizedStatus, collection };
}
