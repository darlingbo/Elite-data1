import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, fmtAgentApplied } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, whatsapp, business_name, password } = body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !whatsapp?.trim()) {
    return Response.json({ error: "Name, email, phone, and WhatsApp number are all required." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  // Check duplicate
  const { data: existing, error: checkErr } = await supabase
    .from("agents")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  // If the table doesn't exist at all, checkErr will tell us
  if (checkErr && checkErr.code === "42P01") {
    return Response.json({ error: "Database not set up yet. Admin must run the Supabase SQL setup first. Error: table 'agents' does not exist." }, { status: 500 });
  }

  if (existing) {
    const msg =
      existing.status === "approved"
        ? "You are already an approved agent. Please log in to your dashboard."
        : existing.status === "pending"
        ? "Your application is already under review. Contact admin on WhatsApp."
        : "Your previous application was not approved. Please contact admin on WhatsApp.";
    return Response.json({ error: msg }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 10);

  // Tier 1: full insert
  const { error: err1 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp.trim(),
    business_name: business_name?.trim() || null,
    password_hash,
    status: "pending",
    commission_balance: 0,
    total_sales: 0,
    total_revenue: 0,
  });

  if (!err1) {
    await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
    return Response.json({ success: true });
  }

  // Tier 2: without password_hash
  const { error: err2 } = await supabase.from("agents").insert({
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

  if (!err2) {
    await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
    return Response.json({ success: true });
  }

  // Tier 3: without whatsapp + total_revenue
  const { error: err3 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    business_name: business_name?.trim() || null,
    status: "pending",
    commission_balance: 0,
    total_sales: 0,
  });

  if (!err3) {
    await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
    return Response.json({ success: true });
  }

  // Tier 4: absolute minimum
  const { error: err4 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    status: "pending",
    commission_balance: 0,
    total_sales: 0,
  });

  if (!err4) {
    await sendAdminAlert(fmtAgentApplied(name.trim(), email.trim(), phone.trim(), business_name?.trim()));
    return Response.json({ success: true });
  }

  // Return actual Supabase error so we can diagnose
  return Response.json({
    error: `Failed to submit application. Database error: ${err4.message} (code: ${err4.code})`,
  }, { status: 500 });
}
