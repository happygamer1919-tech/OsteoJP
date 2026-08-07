import { NextResponse } from "next/server";

import { DEVICE_COOKIE, readDeviceToken } from "@/lib/auth/device-cookie";
import { hashDeviceToken } from "@/lib/auth/otp";
import { createDrizzleTrustedDeviceStore } from "@/lib/auth/otp-store";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import { RULES, clientKey, tooManyRequests } from "@/lib/rate-limit/limiter";

// POST /api/v1/auth/otp/revoke — revoke THIS device, server-side.
//
// LE-trusted-device-revoke. Sign-out already cleared both cookies, so the token
// was gone from that browser and unrecoverable. What it could not do was write
// `revoked_at`: the column has existed since 0056 and its own comment says
// "revoked on the 4th stays an answerable question", but nothing wrote it,
// because there was no route to write it and the portal must never touch the
// database directly.
//
// So the gap was narrow and real. A dropped cookie is effectively a revocation
// for every practical case — the token exists in exactly one browser. It is NOT
// a revocation for the case where the value was captured before sign-out, and
// more importantly "we cannot revoke" is the wrong answer to have when a patient
// reports a lost phone.
//
// IT TAKES NO BODY AND NO PATIENT ID, exactly like /otp/trusted. The device
// cookie IS the authentication: whoever holds it may revoke it, and holding it
// is the only thing that could authorise revoking it. A patient id in the body
// would be a caller-supplied value that has to be reconciled against the device
// row, and the two can disagree — the same argument that kept the phone number
// out of /otp/trusted.
//
// REVOKING IS IDEMPOTENT AND ALWAYS ANSWERS 204. A caller holding an expired,
// already-revoked, unknown or invented token gets the same response as one
// holding a live token, because:
//   * the honest outcome is identical — after this call that token is not usable;
//   * distinguishing them would turn this into an ORACLE for whether a given
//     device token is live, which is precisely the enumeration surface
//     /otp/trusted was designed not to be.
// The store's `revoke` is a conditional UPDATE, so an unknown hash touches zero
// rows and a re-revoke leaves the FIRST timestamp in place (otp-claim.db.test.ts
// asserts that: re-revoking must not move the date, or "when was it revoked"
// stops being answerable).
//
// THE COOKIE IS CLEARED ON THE WAY OUT, unconditionally. The portal clears its
// own too, but this route must not depend on the caller doing so: a revoked row
// plus a browser still presenting the token means every subsequent visit pays a
// database lookup for a credential that can never succeed again.
//
// IT DOES NOT TOUCH THE SESSION. A session is 12 hours and its own artefact;
// revoking the DEVICE stops the silent 30-day refresh, which is the thing being
// revoked. The portal's signOutAction clears the session cookie alongside this
// call, and the two are deliberately separate concerns.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cleared with the same attributes it was set with, or the browser keeps it. */
function forgetDevice(): string {
  return `${DEVICE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** 204 plus the cookie clear. The ONE response this route ever gives. */
function done(): Response {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Set-Cookie", forgetDevice());
  return res;
}

export async function POST(req: Request): Promise<Response> {
  // Rate limited BEFORE the read, same posture as /otp/trusted. This is a write
  // reachable without a session, so an unauthenticated caller must not be able
  // to spend it freely — even though the write is harmless, the database round
  // trip is not free.
  const verdict = await checkDurableRateLimit(
    clientKey(req, "otp-revoke"),
    RULES.otpVerify,
    createDurableRateLimitStore(),
  );
  if (!verdict.ok) return tooManyRequests(verdict);

  const token = readDeviceToken(req);
  // No token: nothing to revoke, and the answer is still 204 with the cookie
  // cleared. A 401 here would tell a caller that the cookie they sent was
  // unreadable, which is information, and it would also make sign-out noisy for
  // a patient who never trusted this device in the first place.
  if (!token) return done();

  // No env assertion: unlike /otp/trusted this route mints nothing, so
  // PATIENT_SESSION_SECRET is irrelevant to it. Asserting it would make a
  // revocation fail on a misconfiguration that cannot affect the revocation —
  // the wrong direction for a security control.
  await createDrizzleTrustedDeviceStore().revoke(hashDeviceToken(token), new Date());

  return done();
}
