export type Network = "mtn" | "telecel" | "airteltigo";

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
};

export const bundles: Bundle[] = [
  // MTN — cost prices verified from Inventor DataHub (1GB=4.20, 2GB=8.70, 4GB=16.70)
  { id: "mtn-500mb",  network: "mtn", size: "500MB",  sizeGB: 0.5,  price: 4,   costPrice: 2.10,  validity: "30 days" },
  { id: "mtn-1gb",    network: "mtn", size: "1GB",    sizeGB: 1,    price: 7,   costPrice: 4.20,  validity: "30 days" },
  { id: "mtn-2gb",    network: "mtn", size: "2GB",    sizeGB: 2,    price: 12,  costPrice: 8.70,  validity: "30 days", popular: true },
  { id: "mtn-3gb",    network: "mtn", size: "3GB",    sizeGB: 3,    price: 17,  costPrice: 13.00, validity: "30 days" },
  { id: "mtn-5gb",    network: "mtn", size: "5GB",    sizeGB: 5,    price: 25,  costPrice: 20.90, validity: "30 days", popular: true },
  { id: "mtn-10gb",   network: "mtn", size: "10GB",   sizeGB: 10,   price: 45,  costPrice: 39.50, validity: "30 days" },
  { id: "mtn-15gb",   network: "mtn", size: "15GB",   sizeGB: 15,   price: 65,  costPrice: 57.00, validity: "30 days" },
  { id: "mtn-20gb",   network: "mtn", size: "20GB",   sizeGB: 20,   price: 80,  costPrice: 72.00, validity: "30 days", popular: true },
  { id: "mtn-50gb",   network: "mtn", size: "50GB",   sizeGB: 50,   price: 195, costPrice: 172.00, validity: "30 days" },

  // Telecel
  { id: "telecel-500mb", network: "telecel", size: "500MB", sizeGB: 0.5, price: 3.5,  costPrice: 1.90,  validity: "30 days" },
  { id: "telecel-1gb",   network: "telecel", size: "1GB",   sizeGB: 1,   price: 6,    costPrice: 3.60,  validity: "30 days" },
  { id: "telecel-2gb",   network: "telecel", size: "2GB",   sizeGB: 2,   price: 11,   costPrice: 7.50,  validity: "30 days", popular: true },
  { id: "telecel-5gb",   network: "telecel", size: "5GB",   sizeGB: 5,   price: 23,   costPrice: 18.00, validity: "30 days", popular: true },
  { id: "telecel-10gb",  network: "telecel", size: "10GB",  sizeGB: 10,  price: 42,   costPrice: 34.00, validity: "30 days" },
  { id: "telecel-20gb",  network: "telecel", size: "20GB",  sizeGB: 20,  price: 75,   costPrice: 63.00, validity: "30 days", popular: true },
  { id: "telecel-50gb",  network: "telecel", size: "50GB",  sizeGB: 50,  price: 170,  costPrice: 145.00, validity: "30 days" },

  // AirtelTigo
  { id: "at-500mb", network: "airteltigo", size: "500MB", sizeGB: 0.5, price: 3,   costPrice: 1.70,  validity: "30 days" },
  { id: "at-1gb",   network: "airteltigo", size: "1GB",   sizeGB: 1,   price: 6,   costPrice: 3.40,  validity: "30 days" },
  { id: "at-2gb",   network: "airteltigo", size: "2GB",   sizeGB: 2,   price: 10,  costPrice: 7.10,  validity: "30 days", popular: true },
  { id: "at-5gb",   network: "airteltigo", size: "5GB",   sizeGB: 5,   price: 22,  costPrice: 17.00, validity: "30 days", popular: true },
  { id: "at-10gb",  network: "airteltigo", size: "10GB",  sizeGB: 10,  price: 40,  costPrice: 32.00, validity: "30 days" },
  { id: "at-20gb",  network: "airteltigo", size: "20GB",  sizeGB: 20,  price: 70,  costPrice: 60.00, validity: "30 days", popular: true },
  { id: "at-50gb",  network: "airteltigo", size: "50GB",  sizeGB: 50,  price: 160, costPrice: 138.00, validity: "30 days" },
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
};
