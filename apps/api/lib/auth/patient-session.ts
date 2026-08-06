import "server-only";

// W13-03a — the patient portal session. Owner ruling 2026-08-06, OPTION B:
// our own signed session cookie, accepted as a SECOND PRINCIPAL SOURCE
// alongside Supabase staff tokens.
//
// WHY THIS EXISTS AT ALL. Three committed facts could not all hold for a
// phone-only login: getPatientPrincipal accepted only Supabase-issued JWTs;
// no-session-minting.test.ts bans every Supabase session-minting call in this
// app; and WF-07 linkage refuses any patient row whose auth_user_id is already
// set, so the first successful login would lock that patient out of every later
// one. Option B keeps all three intact by not involving Supabase at all: the
// session is ours, the scan stays binding, and no patient row is ever linked to
// an auth user.
//
// TWO ARTEFACTS, TWO JOBS, and the split is the whole design:
//
//   SESSION cookie   — short-lived bearer. Proves "this request is that
//                      patient, right now". 12 hours, absolute, no sliding.
//   DEVICE cookie    — long-lived, revocable, 30 days fixed at issue
//                      (device-cookie.ts). Proves "this browser may obtain a
//                      session without an SMS".
//
// THE DEVICE TOKEN IS THE REFRESH TOKEN, and that is the refresh semantic in
// full: when a session expires the browser still holds the device cookie, so
// POST /auth/otp/trusted mints a fresh session with no SMS and no code. Nothing
// slides, nothing extends itself. A session cannot outlive 12 hours and a device
// cannot outlive its 30 days, so the worst case for a stolen session cookie is
// bounded by the shorter of the two and revoking the device ends both.
//
// WHY 12 HOURS. Long enough to cover a clinic visit plus the booking a patient
// makes afterwards, short enough that a cookie lifted from a shared or family
// device is dead the same day. Decision D fixes the device window at 30 days and
// requires the session to be shorter; this is the shorter one, and it is the
// only number here that is a judgement rather than a ruling.
//
// PII RULE (#7): the payload carries ids only. No name, no phone, no NIF, no
// clinical value ever enters a cookie.

import { SignJWT, jwtVerify } from "jose";

import type { PatientPrincipal } from "@osteojp/auth";

/* ---------------------------------- policy -------------------------------- */

/** Session lifetime. Shorter than the 30-day device window, by ruling. */
export const PATIENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The cookie. `__Host-` prefixed for the same reason the device cookie is: the
 * BROWSER enforces that prefix, refusing the cookie unless it is Secure, Path=/
 * and carries no Domain. A later edit that relaxes any of those stops the cookie
 * working rather than silently weakening it.
 */
export const SESSION_COOKIE = "__Host-ojp_session";

/**
 * Env var NAME. The VALUE is the owner's to generate and set; it never enters a
 * build shell, a log, or this file.
 *
 * PLACEMENT, stated here because a secret in the wrong project is a silent
 * outage: Vercel project `osteojp-api` ONLY, scopes Production + Preview +
 * Development, marked Sensitive. The portal project does NOT need it and must
 * not have it — the portal never verifies this cookie, it asks the API who the
 * caller is. One project holds the secret, which is one place to rotate.
 *
 * Generate with 32 bytes of randomness, e.g. `openssl rand -base64 32`.
 */
export const SESSION_SECRET_ENV = "PATIENT_SESSION_SECRET";

const ISSUER = "osteojp-api";
const AUDIENCE = "osteojp-portal";

/* ---------------------------------- secret -------------------------------- */

/**
 * The signing key, or null when the var is unset.
 *
 * NULL IS A REFUSAL, NEVER A FALLBACK. There is deliberately no development
 * default: a hard-coded dev secret is a signing key in a public repository, and
 * the one thing worse than no session is a session anyone can forge.
 */
function secretKey(): Uint8Array | null {
  const raw = process.env[SESSION_SECRET_ENV];
  if (!raw || raw.length < 32) return null;
  return new TextEncoder().encode(raw);
}

/**
 * Boot assertion for the MINT path. Throws, loudly, naming the variable.
 *
 * PLACED AT THE MINT CHOKE POINTS, not at module load, and the reasoning is the
 * same one assertNotificationEnv follows: a global boot throw would take down
 * every staff and patient read in this app over a variable only the login path
 * needs, while a login path that quietly mints nothing is the "fails at the
 * user, not at boot" class #763 removed from the reminder path. So the routes
 * that mint fail at boot, and the routes that merely VERIFY fail closed.
 *
 * The message names the variable and never its value.
 */
export function assertPatientSessionEnv(): void {
  if (secretKey() === null) {
    throw new Error(
      `${SESSION_SECRET_ENV} is required and has no default. ` +
        "Set it in the osteojp-api Vercel project (Production + Preview + Development, Sensitive), " +
        "at least 32 characters. The patient portal cannot mint a session without it.",
    );
  }
}

/* ----------------------------------- mint --------------------------------- */

export type PatientSessionClaims = {
  tenantId: string;
  patientId: string;
  /** When the session was minted. Absolute expiry is derived from it. */
  issuedAt: Date;
};

/**
 * Mint a signed session for a patient whose OTP has just been proven.
 *
 * CALLED FROM EXACTLY TWO PLACES, both of which have already established who the
 * caller is: the OTP verify route, inside the claim transaction, and the
 * trusted-device route, after a live device token resolves to a patient. Any
 * third call site is a bug, and no-session-minting.test.ts asserts that.
 */
export async function mintPatientSession(
  claims: PatientSessionClaims,
): Promise<string> {
  const key = secretKey();
  if (key === null) {
    // Never mint an unsigned or weakly-signed token. Refusing is the safe end.
    throw new Error(`${SESSION_SECRET_ENV} is not set; refusing to mint a session.`);
  }
  const iat = Math.floor(claims.issuedAt.getTime() / 1000);
  return new SignJWT({ tenant_id: claims.tenantId, patient_id: claims.patientId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`otp:${claims.patientId}`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + PATIENT_SESSION_TTL_MS / 1000)
    .sign(key);
}

/* ---------------------------------- verify -------------------------------- */

/**
 * Verify a session cookie and return the principal, or null. Fail-closed at
 * every step.
 *
 * `algorithms: ["HS256"]` is PINNED. The `alg` header is attacker-controlled, so
 * an allowlist — not the header — decides what is acceptable. Without it a token
 * claiming `alg: none` is a forged session. Same defence, same reasoning, as
 * lib/auth/jwt.ts applies to Supabase tokens.
 *
 * Issuer and audience are pinned too, so a token minted for something else in
 * this estate cannot be replayed here.
 *
 * THE userId IS `otp:<patientId>`, NOT A UUID, and that is deliberate. The field
 * is documented as "the Supabase auth user id, useful for audit, never an RLS
 * key", and an OTP-authenticated patient HAS no auth user. A synthetic uuid
 * would be a fabricated identity; this marker says truthfully how the session
 * was obtained. Nothing in apps/api reads userId today, and a test asserts this
 * value can never be mistaken for an auth user id.
 */
export async function verifyPatientSession(
  token: string,
): Promise<PatientPrincipal | null> {
  const key = secretKey();
  if (key === null) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 5,
    });
    const tenantId = payload.tenant_id;
    const patientId = payload.patient_id;
    if (typeof tenantId !== "string" || typeof patientId !== "string") return null;
    if (!UUID_RE.test(tenantId) || !UUID_RE.test(patientId)) return null;
    // exp is REQUIRED. jose enforces it when present; a token without one would
    // never expire, so its absence is refused rather than treated as forever.
    if (typeof payload.exp !== "number") return null;
    return { tenantId, patientId, userId: `otp:${patientId}` };
  } catch {
    // Expired, forged, wrong issuer, wrong algorithm, malformed: one refusal.
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------------------------------- cookie -------------------------------- */

const MAX_AGE_S = Math.floor(PATIENT_SESSION_TTL_MS / 1000);

/** The Set-Cookie value that plants a freshly minted session. */
export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_S}`,
  ].join("; ");
}

/** Clear it with the same attributes, or the browser keeps it. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Read the session token out of a request's Cookie header.
 *
 * Hand-parsed for the same reason device-cookie.ts is: these routes take a plain
 * `Request` and are unit-tested as plain functions, so a helper needing a Next
 * request context would make the tests prove less than the routes do.
 */
export function readSessionToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
