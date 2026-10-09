import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ycgtybmkqrmmlkelwtvq.supabase.co";

// Accept SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.
// Supports both new format (sb_secret_...) and standard Supabase JWT service role keys.
const rawServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const usingServiceKey = Boolean(rawServiceKey);
const supabaseKey = usingServiceKey
  ? rawServiceKey
  : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

if (!usingServiceKey && typeof window === "undefined") {
  console.error(
    "[supabase] SUPABASE_SERVICE_ROLE_KEY is missing in environment variables. " +
    "Server-side queries will fall back to anon key and be blocked by RLS."
  );
}

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
