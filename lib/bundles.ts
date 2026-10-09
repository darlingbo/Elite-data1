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

// Base bundles provide an immediate fallback if DB queries are transiently unavailable.
// Live prices and custom packages in bundle_prices table override these dynamically.
export const bundles: Bundle[] = [
  // MTN — matching silentecho.online/guest exactly
  { id: "mtn-1gb",    network: "mtn", size: "1GB",   sizeGB: 1,   price: 5,     costPrice: 4.30,  validity: "90 days" },
  { id: "mtn-2gb",    network: "mtn", size: "2GB",   sizeGB: 2,   price: 10,    costPrice: 8.90,  validity: "90 days", popular: true },
  { id: "mtn-3gb",    network: "mtn", size: "3GB",   sizeGB: 3,   price: 15,    costPrice: 13.30, validity: "90 days" },
  { id: "mtn-4gb",    network: "mtn", size: "4GB",   sizeGB: 4,   price: 20,    costPrice: 17.50, validity: "90 days" },
  { id: "mtn-5gb",    network: "mtn", size: "5GB",   sizeGB: 5,   price: 25,    costPrice: 22.50, validity: "90 days", popular: true },
  { id: "mtn-6gb",    network: "mtn", size: "6GB",   sizeGB: 6,   price: 28,    costPrice: 26.50, validity: "90 days" },
  { id: "mtn-8gb",    network: "mtn", size: "8GB",   sizeGB: 8,   price: 37.5,  costPrice: 33.50, validity: "90 days" },
  { id: "mtn-10gb",   network: "mtn", size: "10GB",  sizeGB: 10,  price: 48,    costPrice: 44.00, validity: "90 days", popular: true },
  { id: "mtn-15gb",   network: "mtn", size: "15GB",  sizeGB: 15,  price: 67,    costPrice: 62.50, validity: "90 days" },
  { id: "mtn-20gb",   network: "mtn", size: "20GB",  sizeGB: 20,  price: 88,    costPrice: 82.00, validity: "90 days", popular: true },
  { id: "mtn-30gb",   network: "mtn", size: "30GB",  sizeGB: 30,  price: 127,   costPrice: 122.00, validity: "90 days" },

  // Telecel — matching silentecho.online/guest exactly
  { id: "telecel-10gb", network: "telecel", size: "10GB", sizeGB: 10, price: 40,  costPrice: 38.50, validity: "Unlimited", popular: true },
  { id: "telecel-15gb", network: "telecel", size: "15GB", sizeGB: 15, price: 56,  costPrice: 55.00, validity: "Unlimited" },
  { id: "telecel-20gb", network: "telecel", size: "20GB", sizeGB: 20, price: 76,  costPrice: 75.00, validity: "Unlimited", popular: true },
  { id: "telecel-25gb", network: "telecel", size: "25GB", sizeGB: 25, price: 93,  costPrice: 90.50, validity: "Unlimited" },
  { id: "telecel-30gb", network: "telecel", size: "30GB", sizeGB: 30, price: 110, costPrice: 108.00, validity: "Unlimited" },
  { id: "telecel-40gb", network: "telecel", size: "40GB", sizeGB: 40, price: 150, costPrice: 145.00, validity: "30 days", popular: true },

  // AirtelTigo — matching silentecho.online/guest exactly
  { id: "at-1gb",  network: "airteltigo", size: "1GB",  sizeGB: 1,  price: 4.5,   costPrice: 4.00,  validity: "90 days" },
  { id: "at-2gb",  network: "airteltigo", size: "2GB",  sizeGB: 2,  price: 9,     costPrice: 8.50,  validity: "90 days", popular: true },
  { id: "at-3gb",  network: "airteltigo", size: "3GB",  sizeGB: 3,  price: 14,    costPrice: 12.00, validity: "90 days" },
  { id: "at-4gb",  network: "airteltigo", size: "4GB",  sizeGB: 4,  price: 18,    costPrice: 17.00, validity: "90 days" },
  { id: "at-5gb",  network: "airteltigo", size: "5GB",  sizeGB: 5,  price: 22.5,  costPrice: 20.20, validity: "90 days", popular: true },
  { id: "at-6gb",  network: "airteltigo", size: "6GB",  sizeGB: 6,  price: 26.5,  costPrice: 25.00, validity: "90 days" },
  { id: "at-7gb",  network: "airteltigo", size: "7GB",  sizeGB: 7,  price: 31,    costPrice: 29.00, validity: "90 days" },
  { id: "at-8gb",  network: "airteltigo", size: "8GB",  sizeGB: 8,  price: 35,    costPrice: 31.00, validity: "90 days" },
  { id: "at-9gb",  network: "airteltigo", size: "9GB",  sizeGB: 9,  price: 40,    costPrice: 37.00, validity: "90 days" },
  { id: "at-10gb", network: "airteltigo", size: "10GB", sizeGB: 10, price: 43,    costPrice: 41.00, validity: "90 days" },
  { id: "at-12gb", network: "airteltigo", size: "12GB", sizeGB: 12, price: 50.55, costPrice: 49.00, validity: "90 days" },
];

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
  mashup: {
    name: "Mashup",
    color: "#8b5cf6",
    bgColor: "bg-purple-500",
    textColor: "text-purple-600",
    borderColor: "border-purple-500",
    bgLight: "bg-purple-50",
    logo: "MX",
  },
};
