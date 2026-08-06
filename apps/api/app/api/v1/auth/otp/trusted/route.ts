import { NextResponse } from "next/server";

import { DEVICE_COOKIE, readDeviceToken } from "@/lib/auth/device-cookie";
import { hashDeviceToken } from "@/lib/auth/otp";
import { createDrizzleTrustedDeviceStore } from "@/lib/auth/otp-store";
import {
  assertPatientSessionEnv,
  mintPatientSession,
  sessionCookie,
} from "@/lib/auth/patient-session";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import { RULES, clientKey, tooManyRequests } from "@/lib/rate-limit/limiter";

// POST /api/v1/auth/otp/trusted — is THIS device already trusted?
//
// This is the "before demanding a code" half of Decision D's trusted device: the
// portal asks here first, and only falls through to the phone-and-code screens
// when the answer is no. Without it the 30-day window would be a stored fact
// nothing ever read.
//
// IT TAKES NO PHONE NUMBER, AND THAT IS THE POINT. The obvious alternative was
// to fold this into /otp/request and skip the SMS for a trusted caller, but that
// route accepts a caller-supplied phone while the device row names a patient of
// its own. The two can disagree, and the only ways to resolve the disagreement
// are to query the patient table on the request path — which is exactly the
// membership leak /otp/request is built to avoid — or to ignore the phone, which
// would make the parameter a lie. A device-only route has neither problem: the
// answer is derived from the credential and nothing else.
//
// IT LEAKS NOTHING TO AN ATTACKER WITHOUT THE COOKIE. The branch is keyed on a
// 256-bit secret, not on whether a phone is known, so a caller who does not hold
// a valid device token sees the same 401 as one holding a revoked, expired or
// invented one. That is not the enumeration surface /otp/request is; a caller
// who already holds the credential learns only what the credential is for.
//
// IT IS ALSO THE REFRESH PATH. A session lasts 12 hours; a trusted device lasts
// 30 days. When the session expires the browser still holds the device cookie,
// so this route mints a fresh session with no SMS and no code. That is the whole
// refresh semantic, and it is why nothing needs a refresh token: the device
// cookie IS one, except that it is revocable server-side and cannot extend its
// own window.
//
// WHAT IT DOES NOT DO: extend the DEVICE. A check is a read. `last_seen_at` is
// not written, and `expires_at` is never recomputed — LOOP 3 step 6 requires that
// the device "does not extend itself silently on use", and a sliding window would
// mean an active device never expires at all, which is a different control from
// the one the owner ruled. Minting a fresh SESSION is not extending the DEVICE:
// the device still dies on its original 30-day boundary, and when it does, this
// route refuses and the patient gets an SMS like anyone else.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route mints, so it fails at boot rather than at the patient. See the
// verify route for the full reasoning.
assertPatientSessionEnv();

/** Cleared with the same attributes it was set with, or the browser keeps it. */
function forgetDevice(): string {
  return `${DEVICE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function POST(req: Request): Promise<Response> {
  // Rate limited BEFORE the check, copying auth/session/route.ts's posture: an
  // unauthenticated caller must not be able to spend the verification budget,
  // and this path is a guessing surface like any other credential check.
  const verdict = await checkDurableRateLimit(
    clientKey(req, "otp-trusted"),
    RULES.otpVerify,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) return tooManyRequests(verdict);

  const token = readDeviceToken(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const trusted = await createDrizzleTrustedDeviceStore().isTrusted(
    hashDeviceToken(token),
    now,
  );

  if (!trusted) {
    // The cookie is cleared on refusal so an expired or revoked device stops
    // presenting a credential the server will never accept again. Otherwise the
    // browser would keep sending it for the rest of its Max-Age and the patient
    // would keep paying a database lookup for a dead row on every visit.
    const res = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    res.headers.set("Set-Cookie", forgetDevice());
    return res;
  }

  const session = await mintPatientSession({
    // The tenant comes from the DEVICE ROW, never from the request: this route
    // takes no body at all, so there is no caller-supplied value to confuse it
    // with. Same rule as every other patient path — ids are server-derived.
    tenantId: trusted.tenantId,
    patientId: trusted.patientId,
    issuedAt: now,
  });

  const res = NextResponse.json({ patientId: trusted.patientId });
  res.headers.set("Set-Cookie", sessionCookie(session));
  return res;
}
