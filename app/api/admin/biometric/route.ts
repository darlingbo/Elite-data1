import { NextRequest } from "next/server";
import { cookies } from "next/headers";
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
const RP_ID = "elitedata1.com";
const VALID_ORIGINS = ["https://www.elitedata1.com", "https://elitedata1.com"];
const ADMIN_USER_ID = new TextEncoder().encode("elite-admin");
const CHALLENGE_TTL = 5 * 60 * 1000;

// ── All storage uses httpOnly cookies — no Supabase dependency ───────────────
// This avoids RLS / anon-key write failures on system_settings.

type StoredCredential = {
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  createdAt: string;
};

async function saveChallenge(challenge: string): Promise<void> {
  const jar = await cookies();
  jar.set("bm_ch", JSON.stringify({ ch: challenge, exp: Date.now() + CHALLENGE_TTL }), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
}

async function getAndClearChallenge(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get("bm_ch")?.value;
  if (!raw) return null;
  try {
    const { ch, exp } = JSON.parse(raw);
    jar.delete("bm_ch");
    if (!ch || exp < Date.now()) return null;
    return ch as string;
  } catch { return null; }
}

async function getCredentials(): Promise<StoredCredential[]> {
  const jar = await cookies();
  const raw = jar.get("bm_creds")?.value;
  if (!raw) return [];
  try { return JSON.parse(raw) as StoredCredential[]; } catch { return []; }
}

async function saveCredentials(creds: StoredCredential[]): Promise<void> {
  const jar = await cookies();
  jar.set("bm_creds", JSON.stringify(creds), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

function requireAdminSession(request: NextRequest): boolean {
  const session = request.cookies.get("admin_session")?.value;
  const token = process.env.ADMIN_SESSION_TOKEN;
  if (!token) return false;
  return session === token;
}

function getExpectedOrigins(request: NextRequest): string[] {
  const origins = new Set(VALID_ORIGINS);
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin) origins.add(reqOrigin);
  return [...origins];
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "registration-options") {
    if (!requireAdminSession(request))
      return Response.json({ error: "Unauthorized — please log in first" }, { status: 401 });

    const existingCreds = await getCredentials();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: ADMIN_USER_ID,
      userName: "admin",
      userDisplayName: "Elite Data Admin",
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "preferred",
        residentKey: "preferred",
      },
      excludeCredentials: existingCreds.map(c => ({ id: c.credentialId, transports: c.transports })),
    });
    await saveChallenge(options.challenge);
    return Response.json(options);
  }

  if (action === "authentication-options") {
    const creds = await getCredentials();
    if (!creds.length) return Response.json({ error: "No credentials registered" }, { status: 404 });
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: "preferred",
      allowCredentials: [], // empty = any passkey on device works
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

// ── POST ──────────────────────────────────────────────────────────────────────
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
        expectedOrigin: getExpectedOrigins(request),
        expectedRPID: RP_ID,
        requireUserVerification: false,
      });
    } catch (e) {
      return Response.json({ error: `Verification error: ${String(e)}` }, { status: 400 });
    }

    if (!verification.verified || !verification.registrationInfo)
      return Response.json({ error: "Biometric verification failed." }, { status: 400 });

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
    await saveCredentials([...creds.filter(c => c.credentialId !== newCred.credentialId), newCred]);
    return Response.json({ success: true });
  }

  if (action === "authentication-verify") {
    const body = await request.json();
    const expectedChallenge = await getAndClearChallenge();
    if (!expectedChallenge) return Response.json({ error: "Challenge expired — try again" }, { status: 400 });

    const creds = await getCredentials();
    const matchedCred = creds.find(c => c.credentialId === body.id);
    if (!matchedCred) return Response.json({ error: "Credential not recognised — log in with password and re-register fingerprint" }, { status: 400 });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: getExpectedOrigins(request),
        expectedRPID: RP_ID,
        requireUserVerification: false,
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

    // Update counter
    await saveCredentials(creds.map(c =>
      c.credentialId === matchedCred.credentialId
        ? { ...c, counter: verification.authenticationInfo.newCounter }
        : c
    ));

    const token = process.env.ADMIN_SESSION_TOKEN;
    if (!token) return Response.json({ error: "ADMIN_SESSION_TOKEN not set" }, { status: 500 });
    const jar = await cookies();
    jar.set("admin_session", token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 60 * 60 * 5,
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
