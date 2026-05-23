import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function authenticateApiKey(request: NextRequest): Promise<{ ok: true; keyId: string } | { ok: false; error: string }> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!key || !key.startsWith("elite_")) {
    return { ok: false, error: "Missing or invalid API key. Pass it as: Authorization: Bearer elite_xxx" };
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, active")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Invalid API key." };
  if (!data.active) return { ok: false, error: "API key has been revoked." };

  // Fire-and-forget: update last_used_at and increment request count
  supabase.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  supabase.rpc("increment_api_key_requests", { p_key_id: data.id }).then(() => {});

  return { ok: true, keyId: data.id };
}
