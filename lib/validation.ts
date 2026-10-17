import { z } from "zod";

// ── Shared input validation ───────────────────────────────────────────────────
// Pure helpers (easy to unit-test) plus zod schemas for API request bodies.

/** Ghana MoMo/data numbers: 10 digits, 0 + network prefix 2-5 + 8 more digits. */
export const GHANA_PHONE_RE = /^0[2-5][0-9]{8}$/;

/** Remove all whitespace from a phone string. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\s/g, "");
}

/** True when the (whitespace-stripped) phone is a valid Ghana number. */
export function isValidGhanaPhone(phone: string): boolean {
  return GHANA_PHONE_RE.test(normalizePhone(phone));
}

/** Parse a request body against a schema. Returns data or a flat error message. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  return { ok: false, error: first?.message ?? "Invalid request." };
}
