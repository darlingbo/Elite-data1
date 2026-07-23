import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { verifyAdminSessionValue } from "@/lib/adminAuth";
import { generateReconciliationSnapshot } from "@/lib/reconciliationServer";

async function isAdmin() {
  const cookieStore = await cookies();
  return verifyAdminSessionValue(cookieStore.get("admin_session")?.value);
}

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const reportDate = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  try {
    const [{ snapshot, issues }, historyResult] = await Promise.all([
      generateReconciliationSnapshot(reportDate),
      supabase.from("financial_reconciliation_snapshots")
        .select("id,report_date,status,issue_count,risk_amount,metrics,generated_at")
        .order("report_date", { ascending: false })
        .limit(31),
    ]);
    if (historyResult.error) throw new Error(historyResult.error.message);

    return Response.json({
      snapshot,
      issues,
      history: historyResult.data ?? [],
      methodology: {
        timezone: "UTC/Ghana",
        paymentEvidence: "Paystack reference or recognised wallet/manual/API order source",
        expectedProfit: "Completed order amount minus provider cost minus agent commission, before payment processing fees",
        note: "This report never delivers orders, refunds customers, or changes balances.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconciliation failed";
    const status = message === "Invalid report date" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
