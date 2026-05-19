import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, fmtAgentApplied } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, whatsapp, business_name } = body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !whatsapp?.trim()) {
    return Response.json({ error: "Name, email, phone number, and WhatsApp number are all required." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Check duplicate
  const { data: existing } = await supabase
    .from("agents")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (existing) {
    const msg =
      existing.status === "approved"
        ? "You are already an approved agent."
        : existing.status === "pending"
        ? "Your application is already under review. We will contact you soon."
        : "Your previous application was not approved. Please contact admin on WhatsApp.";
    return Response.json({ error: msg }, { status: 409 });
  }

  // Try full insert with all fields
  const fullInsert = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp.trim(),
    business_name: business_name?.trim() || null,
    status: "pending",
    commission_balance: 0,
    total_sales: 0,
    total_revenue: 0,
  });

  if (!fullInsert.error) {
    await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
    return Response.json({ success: true });
  }

  // Fallback: without whatsapp + total_revenue (columns may not exist yet)
  const midInsert = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    business_name: business_name?.trim() || null,
    status: "pending",
    commission_balance: 0,
    total_sales: 0,
  });

  if (!midInsert.error) {
    await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
    return Response.json({ success: true });
  }

  // Minimal fallback: just the core fields
  const minInsert = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    status: "pending",
    commission_balance: 0,
    total_sales: 0,
  });

  if (minInsert.error) {
    return Response.json({ error: "Failed to submit application. Please try again." }, { status: 500 });
  }

  await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
  return Response.json({ success: true });
}
