import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { networkApiName } from "@/lib/bundles";
import { sendAdminAlert } from "@/lib/telegram";
import { verifyAdminSessionValue } from "@/lib/adminAuth";

async function isAdmin() {
  const c = await cookies();
  return verifyAdminSessionValue(c.get("admin_session")?.value);
}

// POST — deliver missing data to a customer
// Body: { phone, network, sizeGB, note, originalRef? }
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    phone: string;
    network: string;
    sizeGB: number;
    note?: string;
    originalRef?: string;
  };

  const { phone, network, sizeGB, note, originalRef } = body;
  if (!phone || !network || !sizeGB) return Response.json({ error: "phone, network, sizeGB required" }, { status: 400 });

  const ref = originalRef
    ? `compensate-${originalRef}`
    : `compensate-${phone}-${Date.now()}`;

  // Deliver via Inventor
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let deliveryLog = "";
  let deliveryOk = false;
  try {
    const res = await fetch(`${process.env.INVENTOR_API_BASE_URL}/api/developer/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INVENTOR_API_KEY}` },
      body: JSON.stringify({
        network: networkApiName[network as keyof typeof networkApiName] ?? network.toUpperCase(),
        Phone: phone,
        Datasize: sizeGB,
        reference: ref,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const invBody = await res.json().catch(() => ({})) as Record<string, unknown>;
    deliveryOk = res.ok || invBody.success === true || String(invBody.status).toLowerCase().includes("process");
    deliveryLog = `HTTP ${res.status}: ${JSON.stringify(invBody).slice(0, 300)}`;
  } catch (e) {
    clearTimeout(timer);
    deliveryLog = String(e);
  }

  // Log compensate order
  await supabase.from("orders").insert({
    reference: ref,
    phone,
    network,
    bundle_size: `${sizeGB}GB (compensation)`,
    amount: 0,
    status: deliveryOk ? "completed" : "delivery_unknown",
    agent_commission: 0,
    admin_commission: 0,
    cost_price: 0,
    customer_name: "Compensation",
  }).maybeSingle();

  await sendAdminAlert(
    `🔧 COMPENSATION\n📞 ${phone} → ${network.toUpperCase()} ${sizeGB}GB\n✅ Delivery: ${deliveryOk ? "OK" : "FAILED"}\nRef: ${ref}\n${note ? `Note: ${note}\n` : ""}${deliveryLog}`
  ).catch(() => {});

  return Response.json({ success: deliveryOk, deliveryLog, ref });
}
