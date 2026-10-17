import { supabase } from "@/lib/supabase";
import { bundles, type Network } from "@/lib/bundles";

/**
 * Which network a bundle id belongs to, or null when the id is unknown.
 * Live rows in bundle_prices win over the built-in list. Mashup bundles return
 * "mashup" because the admin delivers them by hand.
 */
export async function lookupBundleNetwork(bundleId: string): Promise<Network | null> {
  const id = String(bundleId ?? "").trim();
  if (!id) return null;
  try {
    const { data } = await supabase.from("bundle_prices").select("network").eq("id", id).maybeSingle();
    const net = (data as { network?: string | null } | null)?.network;
    if (net === "mtn" || net === "telecel" || net === "airteltigo") return net;
  } catch { /* fall through to the built-in list */ }
  const builtIn = bundles.find((b) => b.id === id);
  if (builtIn) return builtIn.network;
  try {
    const { data } = await supabase.from("mashup_bundles").select("network").eq("id", id).maybeSingle();
    // Mashup bundles are fulfilled by hand, so there is no beneficiary list to check.
    if (data) return "mashup";
  } catch { /* unknown */ }
  return null;
}
