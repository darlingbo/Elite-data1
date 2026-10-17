// Network identity for the buying screens. Colours are the project's canonical tokens.
export type BuyNetwork = "mtn" | "telecel" | "airteltigo" | "mashup";

export interface NetworkMeta {
  id: BuyNetwork;
  label: string;
  short: string;
  color: string;
  /** Text colour that reads on the network colour. */
  ink: string;
  tagline: string;
}

export const NETWORK_META: Record<BuyNetwork, NetworkMeta> = {
  mtn: { id: "mtn", label: "MTN", short: "MTN", color: "#FFC220", ink: "#111827", tagline: "Instant delivery. From GH₵5" },
  telecel: { id: "telecel", label: "Telecel", short: "TC", color: "#E8001D", ink: "#FFFFFF", tagline: "Data that never expires" },
  airteltigo: { id: "airteltigo", label: "AirtelTigo", short: "AT", color: "#E4002B", ink: "#FFFFFF", tagline: "The cheapest per GB" },
  mashup: { id: "mashup", label: "Mashup", short: "MX", color: "#8B5CF6", ink: "#FFFFFF", tagline: "Data and call time together" },
};

export const NETWORK_ORDER: BuyNetwork[] = ["mtn", "telecel", "airteltigo", "mashup"];

export function parseNetwork(raw: string | null | undefined): BuyNetwork {
  const v = String(raw ?? "").toLowerCase();
  return v === "telecel" || v === "airteltigo" || v === "mashup" ? v : "mtn";
}

/** Mobile Money networks a customer can pay from. */
export type MomoNetwork = "mtn" | "telecel" | "at";
export const MOMO_NETWORKS: Array<{ id: MomoNetwork; label: string; color: string }> = [
  { id: "mtn", label: "MTN MoMo", color: "#FFC220" },
  { id: "telecel", label: "Telecel Cash", color: "#E8001D" },
  { id: "at", label: "AirtelTigo Money", color: "#E4002B" },
];
