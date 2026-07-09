import { supabase } from "./supabase";

const KEY = "phone_surcharges";

type SurchargeMap = Record<string, number>; // phone → GHc amount

async function getMap(): Promise<SurchargeMap> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  try { return JSON.parse(data?.value ?? "{}"); } catch { return {}; }
}

async function saveMap(map: SurchargeMap): Promise<void> {
  await supabase
    .from("system_settings")
    .upsert({ key: KEY, value: JSON.stringify(map) }, { onConflict: "key" });
}

export async function getSurcharge(phone: string): Promise<number> {
  const cleaned = phone.replace(/\s/g, "");
  const map = await getMap();
  return map[cleaned] ?? 0;
}

export async function setSurcharge(phone: string, amount: number): Promise<void> {
  const cleaned = phone.replace(/\s/g, "");
  const map = await getMap();
  if (amount <= 0) { delete map[cleaned]; } else { map[cleaned] = amount; }
  await saveMap(map);
}

export async function clearSurcharge(phone: string): Promise<void> {
  await setSurcharge(phone, 0);
}
