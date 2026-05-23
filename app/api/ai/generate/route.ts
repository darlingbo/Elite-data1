import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const REPLICATE_MODEL = "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { token, prompt } = body as { token: string; prompt: string };
  if (!token) return Response.json({ error: "Token required." }, { status: 400 });
  if (!prompt?.trim() || prompt.trim().length < 5) {
    return Response.json({ error: "Please enter a longer description." }, { status: 400 });
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return Response.json({ error: "REPLICATE_API_TOKEN not configured. Add it to Vercel environment variables." }, { status: 500 });
  }

  // Verify session and check credits
  const { data: session } = await supabase
    .from("image_credits")
    .select("id, credits_remaining, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session) return Response.json({ error: "Invalid session token." }, { status: 401 });
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return Response.json({ error: "Your credit session has expired. Please buy a new package." }, { status: 410 });
  }
  if (session.credits_remaining <= 0) {
    return Response.json({ error: "No credits remaining. Please buy more." }, { status: 402 });
  }

  // Deduct credit before generating
  await supabase.from("image_credits")
    .update({ credits_remaining: session.credits_remaining - 1 })
    .eq("id", session.id);

  // Generate with Replicate FLUX Schnell — Prefer: wait makes it synchronous
  try {
    const repRes = await fetch(REPLICATE_MODEL, {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "wait",
      },
      body: JSON.stringify({
        input: {
          prompt: prompt.trim(),
          width: 1024,
          height: 1024,
          num_outputs: 1,
          output_format: "webp",
          output_quality: 90,
        },
      }),
    });

    const repData = await repRes.json();

    if (!repRes.ok || repData.error) {
      throw new Error(repData.error ?? `Replicate error ${repRes.status}`);
    }

    const imageUrl: string | undefined = Array.isArray(repData.output)
      ? repData.output[0]
      : repData.output;

    if (!imageUrl) throw new Error("No image URL returned.");

    return Response.json({ imageUrl, creditsRemaining: session.credits_remaining - 1 });

  } catch (err) {
    // Refund credit on failure
    await supabase.from("image_credits")
      .update({ credits_remaining: session.credits_remaining })
      .eq("id", session.id);

    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Generation failed: ${msg}` }, { status: 500 });
  }
}
