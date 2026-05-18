export type Network = "mtn" | "telecel" | "airteltigo";

export interface Bundle {
  id: string;
  network: Network;
  size: string;
  price: number;
  validity: string;
  popular?: boolean;
}

export const bundles: Bundle[] = [
  // MTN
  { id: "mtn-500mb", network: "mtn", size: "500MB", price: 4, validity: "30 days" },
  { id: "mtn-1gb", network: "mtn", size: "1GB", price: 7, validity: "30 days" },
  { id: "mtn-2gb", network: "mtn", size: "2GB", price: 12, validity: "30 days", popular: true },
  { id: "mtn-3gb", network: "mtn", size: "3GB", price: 17, validity: "30 days" },
  { id: "mtn-5gb", network: "mtn", size: "5GB", price: 25, validity: "30 days", popular: true },
  { id: "mtn-10gb", network: "mtn", size: "10GB", price: 45, validity: "30 days" },
  { id: "mtn-15gb", network: "mtn", size: "15GB", price: 65, validity: "30 days" },
  { id: "mtn-20gb", network: "mtn", size: "20GB", price: 80, validity: "30 days", popular: true },
  { id: "mtn-50gb", network: "mtn", size: "50GB", price: 180, validity: "30 days" },

  // Telecel
  { id: "telecel-500mb", network: "telecel", size: "500MB", price: 3.5, validity: "30 days" },
  { id: "telecel-1gb", network: "telecel", size: "1GB", price: 6, validity: "30 days" },
  { id: "telecel-2gb", network: "telecel", size: "2GB", price: 11, validity: "30 days", popular: true },
  { id: "telecel-5gb", network: "telecel", size: "5GB", price: 23, validity: "30 days", popular: true },
  { id: "telecel-10gb", network: "telecel", size: "10GB", price: 42, validity: "30 days" },
  { id: "telecel-20gb", network: "telecel", size: "20GB", price: 75, validity: "30 days", popular: true },
  { id: "telecel-50gb", network: "telecel", size: "50GB", price: 165, validity: "30 days" },

  // AirtelTigo
  { id: "at-500mb", network: "airteltigo", size: "500MB", price: 3, validity: "30 days" },
  { id: "at-1gb", network: "airteltigo", size: "1GB", price: 6, validity: "30 days" },
  { id: "at-2gb", network: "airteltigo", size: "2GB", price: 10, validity: "30 days", popular: true },
  { id: "at-5gb", network: "airteltigo", size: "5GB", price: 22, validity: "30 days", popular: true },
  { id: "at-10gb", network: "airteltigo", size: "10GB", price: 40, validity: "30 days" },
  { id: "at-20gb", network: "airteltigo", size: "20GB", price: 70, validity: "30 days", popular: true },
  { id: "at-50gb", network: "airteltigo", size: "50GB", price: 155, validity: "30 days" },
];

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
