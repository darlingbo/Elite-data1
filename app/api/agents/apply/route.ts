import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, agentApprovalKeyboard } from "@/lib/telegram";

const PRO_FEE_GHC = 100;

// ── IP rate limiting: max 3 applications per IP per hour ──────────────────────
const applyAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = applyAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    applyAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

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
  // Rate limit by IP
  const ip = getClientIP(request);
  if (!checkRateLimit(ip)) {
    return Response.json({ error: "Too many applications from your device. Please wait an hour and try again." }, { status: 429 });
  }

  const body = await request.json();
  const { name, email, phone, whatsapp, business_name, password, plan, paystackRef } = body;

  // plan must be "free" or "pro"
  if (!["free", "pro"].includes(plan)) {
    return Response.json({ error: "Invalid plan selected." }, { status: 400 });
  }

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !whatsapp?.trim()) {
    return Response.json({ error: "Name, email, phone, and WhatsApp number are all required." }, { status: 400 });
  }

  // Input length caps
  if (name.trim().length > 80 || email.trim().length > 100 || (business_name && business_name.trim().length > 120)) {
    return Response.json({ error: "Input too long. Please check your details." }, { status: 400 });
  }

  if (!email.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Ghana phone number format
  const cleanPhone = phone.replace(/\s/g, "");
  const cleanWA = whatsapp.replace(/\s/g, "");
  if (!/^0[2-5][0-9]{8}$/.test(cleanPhone) && !/^\+233[2-5][0-9]{8}$/.test(cleanPhone)) {
    return Response.json({ error: "Enter a valid Ghana phone number (e.g. 0241234567)." }, { status: 400 });
  }
  if (!/^0[2-5][0-9]{8}$/.test(cleanWA) && !/^\+233[2-5][0-9]{8}$/.test(cleanWA)) {
    return Response.json({ error: "Enter a valid Ghana WhatsApp number." }, { status: 400 });
  }

  if (!password || password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  // Pro agents must have paid
  if (plan === "pro") {
    if (!paystackRef) {
      return Response.json({ error: "Pro registration fee payment is required." }, { status: 400 });
    }
    // Verify GH₵50 payment
    try {
      const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      const psData = await psRes.json() as Record<string, unknown>;
      const txn = psData.data as Record<string, unknown>;
      const amountKobo = Number(txn?.amount ?? 0);
      if (psData.status !== true || txn?.status !== "success" || amountKobo < PRO_FEE_GHC * 100) {
        return Response.json({ error: "Payment not confirmed. Please try again or contact support." }, { status: 400 });
      }
      // Prevent duplicate registrations using same payment reference
      const { data: dupRef } = await supabase.from("agents").select("id").eq("registration_ref", paystackRef).maybeSingle();
      if (dupRef) return Response.json({ error: "This payment has already been used." }, { status: 409 });
    } catch {
      return Response.json({ error: "Could not verify payment. Please try again." }, { status: 502 });
    }
  }

  // Check for duplicate email
  const { data: existing, error: checkErr } = await supabase
    .from("agents")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (checkErr && checkErr.code === "42P01") {
    return Response.json({ error: "Database not set up yet. Admin must run the Supabase SQL setup first." }, { status: 500 });
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

  // Both plans use custom_price — Free just waits for admin approval
  const agent_type = "custom_price";
  const status = plan === "pro" ? "approved" : "pending";

  const insertPayload = {
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp.trim(),
    business_name: business_name?.trim() || null,
    password_hash,
    agent_type,
    status,
    referral_code,
    plan: plan === "pro" ? "pro" : "free",
    registration_ref: paystackRef ?? "FREE",
    commission_balance: 0,
    total_sales: 0,
    total_revenue: 0,
  };

  const { data: inserted, error: err1 } = await supabase.from("agents").insert(insertPayload).select("id").maybeSingle();

  if (!err1) {
    if (plan === "pro") {
      await sendAdminAlert(
        `⚡ <b>New Pro Agent Registered</b>\n\n👤 ${name.trim()}\n📧 ${email.trim()}\n📞 ${phone.trim()}\n🔗 Code: <code>${referral_code}</code>\n💰 Paid GH₵${PRO_FEE_GHC}\n📎 Ref: ${paystackRef}`
      );
    } else {
      const agentId = (inserted as { id: string } | null)?.id ?? "";
      await sendAdminAlert(
        `📋 <b>New Agent Application</b>\n\n👤 ${name.trim()}\n📧 ${email.trim()}\n📞 ${phone.trim()}\n🔗 Code: <code>${referral_code}</code>\n⏳ Tap below to approve or reject:`,
        agentId ? agentApprovalKeyboard(agentId) : undefined
      );
    }
    return Response.json({ success: true, referral_code });
  }

  // Fallback without password_hash (older schema)
  const { error: err2 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    whatsapp: whatsapp.trim(),
    business_name: business_name?.trim() || null,
    agent_type,
    status,
    referral_code,
    plan: plan === "pro" ? "pro" : "free",
    registration_ref: paystackRef ?? "FREE",
    commission_balance: 0,
    total_sales: 0,
    total_revenue: 0,
  });

  if (!err2) {
    if (plan === "pro") {
      await sendAdminAlert(`⚡ New Pro Agent: ${name.trim()} (${email.trim()}) — Code: ${referral_code} — paid GH₵${PRO_FEE_GHC}`);
    } else {
      await sendAdminAlert(`📋 Free Agent Application: ${name.trim()} (${email.trim()}) — Code: ${referral_code} — awaiting approval`);
    }
    return Response.json({ success: true, referral_code });
  }

  // Minimal fallback
  const { error: err3 } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    agent_type,
    status,
    referral_code,
    commission_balance: 0,
    total_sales: 0,
  });

  if (!err3) {
    return Response.json({ success: true, referral_code });
  }

  return Response.json({ error: "Failed to submit application. Please try again or contact support." }, { status: 500 });
}
