import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// New Supabase secret keys start with "sb_secret_".
// Old legacy JWTs start with "eyJ" and were disabled on 2026-05-27 — skip them.
const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseKey = (rawServiceKey && !rawServiceKey.startsWith("eyJ"))
  ? rawServiceKey
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type OrderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Order {
  id?: string;
  reference: string;
  paystack_reference: string;
  customer_name: string;
  customer_email: string;
  phone: string;
  network: string;
  bundle_size: string;
  bundle_size_gb: number;
  amount: number;
  cost_price: number;
  admin_commission: number;
  agent_commission: number;
  agent_id?: string | null;
  status: OrderStatus;
  inventor_order_id?: string;
  created_at?: string;
  updated_at?: string;
}

export type AgentStatus = "pending" | "approved" | "rejected";

export interface Agent {
  id?: string;
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  business_name?: string;
  referral_code?: string;
  status: AgentStatus;
  commission_balance: number;
  total_sales: number;
  total_revenue: number;
  rejection_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BundlePrice {
  id: string;
  price: number;
  cost_price: number;
  active: boolean;
  updated_at?: string;
}
