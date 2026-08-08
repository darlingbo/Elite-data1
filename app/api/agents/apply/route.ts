import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { sendAdminAlert, agentApprovalKeyboard, tgEscape } from "@/lib/telegram";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { getAiSetting, logAiActivity, redactAiText } from "@/lib/ai-safety";
import { rateLimitDb } from "@/lib/rate-limit";

const PRO_FEE_GHC = 100;

type ScreeningAnswers = {
  experience: string;
  customers: string;
  promotionPlan: string;
  supportPlan: string;
  expectedSales: string;
  agreesToRules: boolean;
};

async function screenFreeAgent(answers: ScreeningAnswers): Promise<{ approved: boolean; reason: string; score: number; confidence: string }> {
  const textAnswers = [answers.experience, answers.customers, answers.promotionPlan, answers.supportPlan, answers.expectedSales];
  if (!answers.agreesToRules || textAnswers.some(answer => answer.trim().length < 15)) {
    return { approved: false, reason: "Interview answers were incomplete or the applicant did not accept the agent rules.", score: 0, confidence: "high" };
  }
  try {
    const reply = await generateDeepSeekReply([
      {
        role: "system",
        content: `You screen free Elite Data agent applications in Ghana. Return JSON only: {"decision":"APPROVE|HOLD","score":0-100,"confidence":"low|medium|high","reason":"one short sentence"}.
APPROVE only when the applicant gives specific, coherent plans to find customers, promote honestly, support customers, and follow platform rules. HOLD vague, contradictory, abusive, fraudulent, spam-oriented, misleading, or policy-evading answers. Do not use or infer protected personal traits. You approve only a free reseller account; never approve orders, money, refunds, credit, or paid plans.`,
      },
      { role: "user", content: redactAiText(JSON.stringify(answers)) },
    ]);
    const result = JSON.parse(reply.replace(/^```json\s*|\s*```$/g, "")) as { decision?: string; score?: number; confidence?: string; reason?: string };
    const score = Math.min(100, Math.max(0, Number(result.score) || 0));
    const minScore = Number(await getAiSetting("agent_ai_min_score", "70"));
    const enabled = await getAiSetting("agent_ai_auto_approve_enabled", "1") !== "0";
    const approved = enabled && result.decision === "APPROVE" && score >= minScore && result.confidence !== "low";
    await logAiActivity({ scope: "agent_screening", role: "assistant", content: `Decision ${approved ? "APPROVE" : "HOLD"}; score ${score}; ${String(result.reason ?? "")}` });
    return { approved, score, confidence: ["low", "medium", "high"].includes(String(result.confidence)) ? String(result.confidence) : "low", reason: String(result.reason ?? "AI requested manual review.").slice(0, 300) };
  } catch {
    return { approved: false, reason: "AI screening was unavailable, so the application was held for manual review.", score: 0, confidence: "low" };
  }
}

// ── In-memory rate limit: first-line defence (per serverless instance) ─────────
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
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
  // ── Rate limit ────────────────────────────────────────────────────────────────
  const ip = getClientIP(request);
  if (await rateLimitDb(`agent-application:${ip}`, 3, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many applications from your device. Please wait an hour and try again." }, { status: 429 });
  }

  const body = await request.json();
  const { name, email, phone, whatsapp, business_name, password, plan, paystackRef, masterCode, teamTermsAccepted } = body;
  const screeningAnswers = body.screeningAnswers as ScreeningAnswers | undefined;

  // ── Basic field validation ────────────────────────────────────────────────────
  if (!["free", "pro"].includes(plan)) {
    return Response.json({ error: "Invalid plan selected." }, { status: 400 });
  }
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !whatsapp?.trim()) {
    return Response.json({ error: "Name, email, phone, and WhatsApp number are all required." }, { status: 400 });
  }
  if (name.trim().length > 80 || email.trim().length > 100 || (business_name && business_name.trim().length > 120)) {
    return Response.json({ error: "Input too long. Please check your details." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
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
  if (plan === "free" && !screeningAnswers) {
    return Response.json({ error: "Complete the free-agent interview before applying." }, { status: 400 });
  }

  // ── Pro payment verification ──────────────────────────────────────────────────
  if (plan === "pro") {
    if (!paystackRef) {
      return Response.json({ error: "Pro registration fee payment is required." }, { status: 400 });
    }
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

      // Check reference hasn't been used for a previous agent registration
      const { data: dupAgent } = await supabase.from("agents").select("id").eq("registration_ref", paystackRef).maybeSingle();
      if (dupAgent) return Response.json({ error: "This payment has already been used." }, { status: 409 });

      // Check reference hasn't been used for a regular data order either
      const { data: dupOrder } = await supabase.from("orders").select("reference").eq("reference", paystackRef).maybeSingle();
      if (dupOrder) return Response.json({ error: "This payment reference belongs to a data order and cannot be used for registration." }, { status: 409 });

    } catch {
      return Response.json({ error: "Could not verify payment. Please try again." }, { status: 502 });
    }
  }

  // ── Duplicate email + phone check ─────────────────────────────────────────────
  const { data: existingEmail, error: checkErr } = await supabase
    .from("agents")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (checkErr && checkErr.code === "42P01") {
    return Response.json({ error: "Database not set up yet. Admin must run the Supabase SQL setup first." }, { status: 500 });
  }
  if (existingEmail) {
    const msg =
      existingEmail.status === "approved" ? "You are already an approved agent. Please log in to your dashboard."
      : existingEmail.status === "pending" ? "Your application is already under review. Contact admin on WhatsApp."
      : "Your previous application was not approved. Please contact admin on WhatsApp.";
    return Response.json({ error: msg }, { status: 409 });
  }

  const { data: existingPhone } = await supabase.from("agents").select("id").eq("phone", cleanPhone).maybeSingle();
  if (existingPhone) {
    return Response.json({ error: "This phone number is already registered. Please log in or contact support." }, { status: 409 });
  }

  // ── Create agent record ───────────────────────────────────────────────────────
  const password_hash = await bcrypt.hash(password, 10);
  const referral_code = await generateUniqueReferralCode(name.trim());
  const agent_type = "custom_price";
  const screening = plan === "free"
    ? await screenFreeAgent(screeningAnswers!)
    : { approved: true, reason: "Pro registration payment verified.", score: 100, confidence: "high" };
  const status = plan === "pro" || screening.approved ? "approved" : "pending";
  let recruitingSubAdminId: string | null = null;
  let recruitingMasterName: string | null = null;
  if (masterCode) {
    if (teamTermsAccepted !== true) return Response.json({ error: "You must accept the 70/20/10 team commission terms." }, { status: 400 });
    const { data: masterAgent } = await supabase.from("agents").select("id,name,email,phone,status,plan").eq("referral_code", String(masterCode).trim().toUpperCase()).maybeSingle();
    if (!masterAgent || masterAgent.status !== "approved" || masterAgent.plan !== "pro") return Response.json({ error: "This team invitation is no longer valid." }, { status: 400 });
    if (masterAgent.email.toLowerCase() === email.toLowerCase().trim() || masterAgent.phone === cleanPhone) return Response.json({ error: "A Pro agent cannot recruit their own account." }, { status: 409 });
    const { data: master } = await supabase.from("sub_admins").select("id").eq("agent_id", masterAgent.id).eq("status", "active").maybeSingle();
    if (!master) return Response.json({ error: "The Pro Agent team is not active yet." }, { status: 409 });
    recruitingSubAdminId = master.id; recruitingMasterName = masterAgent.name;
  }

  const { data: inserted, error: insertErr } = await supabase.from("agents").insert({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: cleanPhone,
    whatsapp: cleanWA,
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
    application_answers: plan === "free" ? screeningAnswers : null,
    ai_screening_decision: plan === "free" ? (screening.approved ? "approved" : "manual_review") : null,
    ai_screening_reason: plan === "free" ? screening.reason : null,
    ai_screening_score: plan === "free" ? screening.score : null,
    ai_screening_confidence: plan === "free" ? screening.confidence : null,
    ai_screened_at: plan === "free" ? new Date().toISOString() : null,
    approved_via: plan === "free" && screening.approved ? "ai_free_agent_screening" : plan === "pro" ? "verified_pro_payment" : null,
    sub_admin_id: recruitingSubAdminId,
    team_terms_accepted_at: recruitingSubAdminId ? new Date().toISOString() : null,
    team_terms_version: recruitingSubAdminId ? "2026-08-02-70-20-10" : null,
  }).select("id").maybeSingle();

  if (insertErr) {
    return Response.json({ error: "Failed to submit application. Please try again or contact support." }, { status: 500 });
  }

  // ── Notify admin ──────────────────────────────────────────────────────────────
  const n  = tgEscape(name.trim());
  const em = tgEscape(email.trim());
  const ph = tgEscape(cleanPhone);

  if (plan === "pro") {
    await sendAdminAlert(
      `⚡ <b>New Pro Agent Registered</b>\n\n👤 ${n}\n📧 ${em}\n📞 ${ph}\n🔗 Code: <code>${tgEscape(referral_code)}</code>\n💰 Paid GH₵${PRO_FEE_GHC}\n📎 Ref: <code>${tgEscape(paystackRef ?? "")}</code>`
    );
  } else {
    const agentId = (inserted as { id: string } | null)?.id ?? "";
    if (screening.approved) {
      await sendAdminAlert(
        `✅ <b>Free Agent Approved After AI Interview</b>\n\n👤 ${n}\n📧 ${em}\n📞 ${ph}\n🔗 Code: <code>${tgEscape(referral_code)}</code>\n🧠 ${tgEscape(screening.reason)}\n\nThe AI approved agent access only. It did not approve any order or financial action.`
      );
    } else {
    await sendAdminAlert(
      `📋 <b>New Agent Application</b>\n\n👤 ${n}\n📧 ${em}\n📞 ${ph}\n🔗 Code: <code>${tgEscape(referral_code)}</code>\n⏳ Tap below to approve or reject:`,
      agentId ? agentApprovalKeyboard(agentId) : undefined
    );
    }
  }

  if (recruitingSubAdminId) {
    await supabase.from("sub_admin_activity").insert({ sub_admin_id: recruitingSubAdminId, action: "agent_joined_via_invite", target: (inserted as { id: string } | null)?.id ?? null, details: { agent_name: name.trim(), status } });
    await sendAdminAlert(`🤝 <b>AGENT JOINED PRO TEAM</b>\n\n👤 ${n}\n⭐ Team: ${tgEscape(recruitingMasterName ?? "Pro Agent")}\n📌 Status: ${status}`);
  }

  return Response.json({ success: true, referral_code, autoApproved: plan === "free" && screening.approved });
}
