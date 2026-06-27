import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/server";

const RP_NAME = "Elite Data Admin";
function getRpId() {
  try {
    const url = process.env.SITE_URL ?? "https://elitedata1.com";
    return new URL(url).hostname;
  } catch { return "elitedata1.com"; }
}
function getOrigin() {
  return process.env.SITE_URL ?? "https://elitedata1.com";
}
const ADMIN_USER_ID = new TextEncoder().encode("elite-admin");
const CHALLENGE_TTL = 5 * 60 * 1000;

type StoredCredential = {
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  createdAt: string;
};

// Uses system_settings table (same schema as network settings, one table for everything)
async function getKV(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("system_settings").select("value").eq("key", key).maybeSingle();
  if (error) console.error(`[biometric] getKV(${key}) error:`, error.message);
  return data?.value ?? null;
}

async function setKV(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("system_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    console.error(`[biometric] setKV(${key}) error:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function getCredentials(): Promise<StoredCredential[]> {
  const val = await getKV("biometric_credentials");
  if (!val) return [];
  try { return JSON.parse(val) as StoredCredential[]; } catch { return []; }
}

async function saveCredentials(creds: StoredCredential[]): Promise<{ ok: boolean; error?: string }> {
  return setKV("biometric_credentials", JSON.stringify(creds));
}

async function saveChallenge(challenge: string): Promise<void> {
  await setKV("biometric_challenge", JSON.stringify({ challenge, expiresAt: Date.now() + CHALLENGE_TTL }));
}

async function getAndClearChallenge(): Promise<string | null> {
  const val = await getKV("biometric_challenge");
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    if (!parsed.challenge || parsed.expiresAt < Date.now()) return null;
    await setKV("biometric_challenge", JSON.stringify({ challenge: "", expiresAt: 0 }));
    return parsed.challenge;
  } catch { return null; }
}

function requireAdminSession(request: NextRequest): boolean {
  const session = request.cookies.get("admin_session")?.value;
  const token = process.env.ADMIN_SESSION_TOKEN;
  if (!token) return false;
  return session === token;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "registration-options") {
    if (!requireAdminSession(request)) {
      return Response.json({ error: "Unauthorized — please log in first" }, { status: 401 });
    }
    const existingCreds = await getCredentials();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: getRpId(),
      userID: ADMIN_USER_ID,
      userName: "admin",
      userDisplayName: "Elite Data Admin",
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      excludeCredentials: existingCreds.map(c => ({
        id: c.credentialId,
        transports: c.transports,
      })),
    });
    await saveChallenge(options.challenge);
    return Response.json(options);
  }

  if (action === "authentication-options") {
    const creds = await getCredentials();
    if (!creds.length) return Response.json({ error: "No credentials registered" }, { status: 404 });
    const options = await generateAuthenticationOptions({
      rpID: getRpId(),
      userVerification: "required",
      allowCredentials: creds.map(c => ({ id: c.credentialId, transports: c.transports })),
    });
    await saveChallenge(options.challenge);
    return Response.json(options);
  }

  if (action === "has-credentials") {
    const creds = await getCredentials();
    return Response.json({ registered: creds.length > 0 });
  }

  if (action === "list") {
    if (!requireAdminSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const creds = await getCredentials();
    return Response.json({ credentials: creds.map(c => ({ id: c.credentialId.slice(0, 12) + "…", createdAt: c.createdAt })) });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "registration-verify") {
    if (!requireAdminSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const expectedChallenge = await getAndClearChallenge();
    if (!expectedChallenge) return Response.json({ error: "Challenge expired — tap the button again" }, { status: 400 });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: getOrigin(),
        expectedRPID: getRpId(),
        requireUserVerification: true,
      });
    } catch (e) {
      return Response.json({ error: `Verification error: ${String(e)}` }, { status: 400 });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return Response.json({ error: "Biometric verification failed." }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const creds = await getCredentials();

    const newCred: StoredCredential = {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.response?.transports ?? [],
      createdAt: new Date().toISOString(),
    };

    const updated = [...creds.filter(c => c.credentialId !== newCred.credentialId), newCred];
    const saved = await saveCredentials(updated);
    if (!saved.ok) {
      return Response.json({ error: `Could not save credential: ${saved.error}. Run SQL in Supabase: CREATE TABLE IF NOT EXISTS system_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz DEFAULT now());` }, { status: 500 });
    }
    return Response.json({ success: true });
  }

  if (action === "authentication-verify") {
    const body = await request.json();
    const expectedChallenge = await getAndClearChallenge();
    if (!expectedChallenge) return Response.json({ error: "Challenge expired — try again" }, { status: 400 });

    const creds = await getCredentials();
    const matchedCred = creds.find(c => c.credentialId === body.id);
    if (!matchedCred) return Response.json({ error: "Credential not recognised — re-register in Settings" }, { status: 400 });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: getOrigin(),
        expectedRPID: getRpId(),
        requireUserVerification: true,
        credential: {
          id: matchedCred.credentialId,
          publicKey: Buffer.from(matchedCred.publicKey, "base64url"),
          counter: matchedCred.counter,
          transports: matchedCred.transports,
        },
      });
    } catch (e) {
      return Response.json({ error: `Auth error: ${String(e)}` }, { status: 400 });
    }

    if (!verification.verified) return Response.json({ error: "Biometric verification failed." }, { status: 401 });

    const updated = creds.map(c =>
      c.credentialId === matchedCred.credentialId
        ? { ...c, counter: verification.authenticationInfo.newCounter }
        : c
    );
    await saveCredentials(updated);

    const token = process.env.ADMIN_SESSION_TOKEN;
    if (!token) return Response.json({ error: "ADMIN_SESSION_TOKEN not set in Vercel env vars" }, { status: 500 });
    const cookieStore = await cookies();
    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 5,
    });
    return Response.json({ success: true });
  }

  if (action === "remove") {
    if (!requireAdminSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await saveCredentials([]);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
