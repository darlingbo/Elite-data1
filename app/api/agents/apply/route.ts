import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert } from "@/lib/telegram";

const REGISTRATION_FEE_GHC = 40;

async function generateUniqueReferralCode(name: string): Promise<string> {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  for (let i = 0; i < 10; i++) {
    const code = prefix + Math.random().toString(36).substring(2, 7).toUpperCase();
    const { data } = await supabase.from("agents").select("id").eq("referral_code", code).maybeSingle();
    if (!data) return code;
  }
  return prefix + Date.now().toString(36).toUpperCase().slice(-5);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, whatsapp, business_name, password, paystackRef } = body;
  const agentType = "custom_price"; // all new agents set their own prices

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !whatsapp?.trim()) {
    return Response.json({ error: "Name, email, phone, and WhatsApp number are all required." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (!paystackRef) {
    return Response.json({ error: "Registration fee payment is required." }, { status: 400 });
  }

  // Verify GH₵40 registration fee payment
  try {
    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    const psData = await psRes.json() as Record<string, unknown>;
    const txn = psData.data as Record<string, unknown>;
    const amountKobo = Number(txn?.amount ?? 0);
    if (psData.status !== true || txn?.status !== "success" || amountKobo < REGISTRATION_FEE_GHC * 100) {
      return Response.json({ error: "Payment not confirmed. Please try again or contact support." }, { status: 400 });
    }
    // Prevent duplicate registrations using same payment reference
    const { data: dupRef } = await supabase.from("agents").select("id").eq("registration_ref", paystackRef).maybeSingle();
    if (dupRef) return Response.json({ error: "This payment has already been used." }, { status: 409 });
  } catch {
    return Response.json({ error: "Could not verify payment. Please try again." }, { status: 502 });
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
  const referral_code = await generateUniqueReferralCode(name.trim());

  // Tier 1: full insert — auto-approved after fee payment
  const { error: err1 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp.trim(),
    business_name: business_name?.trim() || null,
    password_hash,
    agent_type: agentType,
    status: "approved",
    referral_code,
    registration_ref: paystackRef,
    commission_balance: 0,
    total_sales: 0,
    total_revenue: 0,
  });

  if (!err1) {
    await sendAdminAlert(`✅ <b>New Agent Approved</b>\n\n👤 ${name.trim()}\n📧 ${email.trim()}\n📞 ${phone.trim()}\n🔗 Code: <code>${referral_code}</code>\n💰 Paid GH₵${REGISTRATION_FEE_GHC}\n📎 Ref: ${paystackRef}`);
    return Response.json({ success: true, referral_code });
  }

  // Tier 2: without password_hash
  const { error: err2 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp.trim(),
    business_name: business_name?.trim() || null,
    agent_type: agentType,
    status: "approved",
    referral_code,
    registration_ref: paystackRef,
    commission_balance: 0,
    total_sales: 0,
    total_revenue: 0,
  });

  if (!err2) {
    await sendAdminAlert(`✅ <b>New Agent Approved</b>\n\n👤 ${name.trim()}\n📧 ${email.trim()}\n📞 ${phone.trim()}\n🔗 Code: <code>${referral_code}</code>\n💰 Paid GH₵${REGISTRATION_FEE_GHC}\n📎 Ref: ${paystackRef}`);
    return Response.json({ success: true, referral_code });
  }

  // Tier 3: without whatsapp + total_revenue
  const { error: err3 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    business_name: business_name?.trim() || null,
    status: "approved",
    referral_code,
    commission_balance: 0,
    total_sales: 0,
  });

  if (!err3) {
    await sendAdminAlert(`✅ New Agent Approved: ${name.trim()} (${email.trim()}) — Code: ${referral_code} — paid GH₵${REGISTRATION_FEE_GHC}`);
    return Response.json({ success: true, referral_code });
  }

  // Tier 4: absolute minimum
  const { error: err4 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    status: "approved",
    referral_code,
    commission_balance: 0,
    total_sales: 0,
  });

  if (!err4) {
    await sendAdminAlert(`✅ New Agent Approved: ${name.trim()} (${email.trim()}) — Code: ${referral_code} — paid GH₵${REGISTRATION_FEE_GHC}`);
    return Response.json({ success: true, referral_code });
  }

  // Return actual Supabase error so we can diagnose
  return Response.json({
    error: `Failed to submit application. Database error: ${err4.message} (code: ${err4.code})`,
  }, { status: 500 });
}
