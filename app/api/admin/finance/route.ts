import { NextRequest } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";
import { buildFinanceAnalytics, type FinanceAgentInput, type FinanceOrderInput } from "@/lib/finance-analytics";
import { addCurrency } from "@/lib/finance";

const PAGE_SIZE = 1000;
const MAX_ROWS = 25_000;
const ORDER_COLUMNS = [
  "reference", "customer_name", "customer_email", "phone", "network", "bundle_size",
  "amount", "cost_price", "agent_commission", "admin_commission", "agent_id", "payment_method", "status",
  "refunded", "refund_amount", "created_at",
].join(",");

async function fetchAllOrders(): Promise<FinanceOrderInput[]> {
  const rows: FinanceOrderInput[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as FinanceOrderInput[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [orders, agentsResult, apiWalletResult] = await Promise.all([
      fetchAllOrders(),
      supabase
        .from("agents")
        .select("id,name,status,commission_balance,wallet_balance")
        .order("name"),
      supabase
        .from("api_keys")
        .select("wallet_balance")
        .eq("active", true),
    ]);

    if (agentsResult.error) throw agentsResult.error;
    if (apiWalletResult.error) throw apiWalletResult.error;

    const agents = (agentsResult.data ?? []) as FinanceAgentInput[];
    const agentWalletTotal = agents.reduce(
      (total, agent) => addCurrency(total, Number(agent.wallet_balance ?? 0)),
      0,
    );
    const apiWalletTotal = (apiWalletResult.data ?? []).reduce(
      (total, key) => addCurrency(total, Number(key.wallet_balance ?? 0)),
      0,
    );
    const params = request.nextUrl.searchParams;
    const result = buildFinanceAnalytics(
      orders,
      agents,
      {
        from: params.get("from"),
        to: params.get("to"),
        agent: params.get("agent"),
        network: params.get("network"),
        status: params.get("status"),
        paymentMethod: params.get("paymentMethod"),
      },
      addCurrency(agentWalletTotal, apiWalletTotal),
    );

    return Response.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not calculate finance analytics." },
      { status: 500 },
    );
  }
}
