export type Network = "mtn" | "telecel" | "airteltigo" | "mashup";

export interface Bundle {
  id: string;
  network: Network;
  size: string;
  sizeGB: number;       // used for Inventor DataHub API (Datasize parameter)
  price: number;        // selling price in GHS
  costPrice: number;    // fulfillment cost in GHS (used for commission calc)
  validity: string;
  popular?: boolean;
}

// Maps our internal network IDs to Inventor DataHub API network names
export const networkApiName: Record<Network, string> = {
  mtn: "MTN",
  telecel: "TELECEL",
  airteltigo: "AT ISHARE",
  mashup: "MASHUP",
};

// All bundles are managed via the admin panel (bundle_prices table in DB).
// No static fallbacks — DB is the single source of truth.
export const bundles: Bundle[] = [];

export function sizeLabel(sizeGB: number): string {
  if (sizeGB < 1) return `${Math.round(sizeGB * 1000)}MB`;
  return `${sizeGB}GB`;
}

export const networkConfig = {
  mtn: {
    name: "MTN",
    color: "#FFC220",
    bgColor: "bg-yellow-400",
    textColor: "text-yellow-600",
    borderColor: "border-yellow-400",
    bgLight: "bg-yellow-50",
    logo: "MTN",
  },
  telecel: {
    name: "Telecel",
    color: "#E8001D",
    bgColor: "bg-red-500",
    textColor: "text-red-600",
    borderColor: "border-red-500",
    bgLight: "bg-red-50",
    logo: "Telecel",
  },
  airteltigo: {
    name: "AirtelTigo",
    color: "#E4002B",
    bgColor: "bg-rose-600",
    textColor: "text-rose-600",
    borderColor: "border-rose-500",
    bgLight: "bg-rose-50",
    logo: "AT",
  },
};
