export type Tab =
  | "overview" | "all-orders" | "pending-orders" | "processing" | "completed" | "failed-orders"
  | "approval-queue"
  | "data-bundles" | "bundle-prices" | "all-agents" | "agent-applications" | "agent-wallets" | "leaderboard"
  | "transactions" | "commissions" | "manual" | "compensate" | "announcements" | "promo" | "apikeys" | "sms" | "settings"
  | "customers" | "mashup-bundles" | "network-providers" | "coupons" | "referrals" | "withdrawals" | "agent-ranks" | "analytics" | "developer-api" | "paystack-split" | "notifications"
  | "refund-numbers" | "operations" | "reconciliation";

export type OrderStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED" | "NOT_ON_LIST" | "PENDING_APPROVAL" | "FRAUD" | "REJECTED";

export interface Order {
  reference: string; status: string; amount: number; admin_commission: number;
  agent_commission: number; cost_price?: number; customer_name: string; phone: string; network: string;
  bundle_size: string; created_at: string; agent_id: string | null;
  agent_name?: string | null; agent_code?: string | null;
  refund_phone?: string | null;
  refunded?: boolean; refunded_at?: string | null; refund_amount?: number | null;
  risk_flags?: string[];
  approved_at?: string | null;
  approved_via?: string | null;
  provider_used?: string | null;
}

export interface Agent {
  id: string; name: string; email: string; phone: string; whatsapp?: string; business_name: string;
  referral_code: string; status: string; agent_type?: string; plan?: string | null; commission_balance: number; wallet_balance?: number;
  total_sales: number; total_revenue: number; created_at: string; registration_ref?: string | null;
}

export interface StatsData {
  orders: { all: Order[]; total: number; completed: number; processing: number; pending: number; failed: number; pendingApproval: number };
  revenue: { total: number; cost: number };
  profit: { admin: number; agentCommissions: number; gross: number };
  agents: { all: Agent[]; total: number; pending: number; approved: number; rejected: number };
}
