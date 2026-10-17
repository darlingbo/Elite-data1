export type Tab =
  | "overview" | "all-orders" | "pending-orders" | "processing" | "completed" | "failed-orders"
  | "approval-queue"
  | "data-bundles"
  | "transactions" | "compensate" | "announcements" | "promo" | "apikeys" | "sms" | "settings"
  | "customers" | "mashup-bundles" | "network-providers" | "coupons" | "analytics" | "developer-api" | "notifications"
  | "refund-numbers" | "operations" | "reconciliation" | "ai-hub" | "result-checker" | "mtn-verification";

export type OrderStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED" | "NOT_ON_LIST" | "PENDING_APPROVAL" | "FRAUD" | "REJECTED" | "REFUNDED";

export interface Order {
  reference: string; status: string; amount: number; admin_commission: number;
  agent_commission: number; cost_price?: number; customer_name: string; phone: string; network: string;
  bundle_size: string; created_at: string; agent_id: string | null;
  refund_phone?: string | null;
  refunded?: boolean; refunded_at?: string | null; refund_amount?: number | null;
  not_on_list_at?: string | null;
  completed_at?: string | null;
  risk_flags?: string[];
  approved_at?: string | null;
  approved_via?: string | null;
  provider_used?: string | null;
}

export interface StatsData {
  orders: { all: Order[]; total: number; completed: number; processing: number; pending: number; failed: number; pendingApproval: number };
  revenue: { total: number; cost: number };
  profit: { admin: number; agentCommissions: number; gross: number };
}
