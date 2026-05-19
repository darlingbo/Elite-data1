import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, fmtAgentApplied } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, whatsapp, business_name } = body;

  if (!name?.trim() || !email?.trim() || !phone?.trim()) {
    return Response.json({ error: "Name, email, and phone are required." }, { status: 400 });
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
        : "Your previous application was rejected. Please contact support.";
    return Response.json({ error: msg }, { status: 409 });
  }

  const { error } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp?.trim() || null,
    business_name: business_name?.trim() || null,
    status: "pending",
    balance: 0,
    total_sales: 0,
    total_revenue: 0,
  });

  if (error) {
    return Response.json({ error: "Failed to submit application. Please try again." }, { status: 500 });
  }

  await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));

  return Response.json({ success: true });
}
