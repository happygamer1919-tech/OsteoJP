import { NextResponse } from "next/server";

import { getDbAdmin } from "@osteojp/db";

import { deviceCookie } from "@/lib/auth/device-cookie";
import { generateDeviceToken, hashDeviceToken, verifyCode } from "@/lib/auth/otp";
import {
  createDrizzleOtpStore,
  createDrizzleTrustedDeviceStore,
} from "@/lib/auth/otp-store";
import { resolvePatientByProvenPhone } from "@/lib/auth/patient-linkage";
import { normalizePhonePT } from "@/lib/notify/phone";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import { RULES, clientKey, tooManyRequests } from "@/lib/rate-limit/limiter";

// POST /api/v1/auth/otp/verify — check a code, resolve the patient, and CLAIM.
//
// EVERY FAILURE IS THE SAME 401 WITH THE SAME BODY. There are six ways to fail
// here and a caller can distinguish none of them: no code was requested, the
// code is wrong, it expired, its attempt cap is spent, the phone resolves to
// zero / several / an already-claimed patient row, or another request redeemed
// the same code first. Two separate modules already enforce that internally —
// otp.ts and patient-linkage.ts each return one shared refusal object with no
// reason field — and this route's job is not to undo it by mapping outcomes onto
// different statuses.
//
// THE LINKAGE REFUSAL IS DELIBERATELY INDISTINGUISHABLE FROM A WRONG CODE, which
// is worth stating because it costs something real: a patient whose number is on
// two rows gets the same screen as someone who fat-fingered a digit, and cannot
// be told why. WF-07 accepted that. The alternative — "your number matches
// several records" — confirms to any caller that a given phone number is in this
// clinic's files, and how many times.
//
// THE CLAIM IS ONE TRANSACTION. Consuming the code, resolving the patient and
// remembering the device commit together or not at all, for the reason 0054
// couples a token action to its consumption record: any two of the three
// committing without the third leaves a login that half happened. The ORDER
// inside it is load-bearing and is explained at each step below.
//
// WHAT THIS ROUTE STILL DOES NOT DO: mint a PORTAL SESSION. It returns the
// resolved patient id and plants a trusted-device cookie, and that is the whole
// of what Decision D rules. Which artefact carries the portal session afterwards
// — and how a patient row acquires `auth_user_id` when WF-07's linkage refuses
// any row that already has one — is an owner decision that is not made anywhere
// in this repository. It is on the board rather than invented here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The single refusal. Byte-identical for every failure mode. */
function refused(): Response {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  const limitStore = createDurableRateLimitStore();

  // Before anything else, and fail-closed: if the durable store is unreachable
  // this refuses rather than allowing, because failing open here would turn a
  // database blip into an unlimited guessing window against a 6-digit code.
  const verdict = await checkDurableRateLimit(
    clientKey(req, "otp-verify"),
    RULES.otpVerify,
    limitStore,
  );
  if (!verdict.ok) return tooManyRequests(verdict);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const b = body as { phone?: unknown; code?: unknown; tenantId?: unknown } | null;
  if (
    typeof b?.phone !== "string" ||
    typeof b?.code !== "string" ||
    typeof b?.tenantId !== "string" ||
    b.tenantId === ""
  ) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const phone = normalizePhonePT(b.phone);
  if (!phone) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const tenantId = b.tenantId;
  const code = b.code;
  const now = new Date();

  const claim = await getDbAdmin().transaction(async (tx) => {
    // 1. Prove the code. This may WRITE — a wrong guess increments the attempt
    //    counter — which is why every refusal below RETURNS null rather than
    //    throwing: throwing would roll the transaction back and refund the
    //    attempt, handing an attacker unlimited guesses against a 5-attempt cap.
    const result = await verifyCode(tenantId, phone, code, {
      store: createDrizzleOtpStore(tx),
      now: () => now,
    });
    if (!result.ok) return null;

    // 2. Only now does the phone touch the patient table — WF-07's "claim time".
    //    Inside the same transaction as the consume below, so "exactly one live
    //    row" is still true at the instant the code is spent rather than a fact
    //    about a moment already past.
    const link = await resolvePatientByProvenPhone(tenantId, phone, tx);
    if (!link.ok) return null;

    // 3. Spend the code, and REFUSE IF WE LOST THE RACE. Two simultaneous
    //    redemptions both reach here; the `consumed_at IS NULL` guard means only
    //    one UPDATE matches and the loser writes nothing, but "writes nothing"
    //    is not "grants nothing" unless the loser checks. It does, here.
    //
    //    AFTER linkage, not before, and the consequence is deliberate: a linkage
    //    refusal leaves the code live for the rest of its five minutes. Burning
    //    it would cost the patient a second SMS to reach the identical refusal,
    //    and buys nothing — the code is already in the hands of whoever holds
    //    that handset, and linkage is deterministic for the same number.
    const won = await createDrizzleOtpStore(tx).consume(result.codeId, now);
    if (!won) return null;

    // 4. Remember the device. The token is generated here and returned ONCE;
    //    only its hash is stored, so this response is the only time the value
    //    exists outside the browser that receives it.
    const deviceToken = generateDeviceToken();
    await createDrizzleTrustedDeviceStore(tx).issue({
      tenantId,
      patientId: link.patientId,
      deviceTokenHash: hashDeviceToken(deviceToken),
      now,
    });

    return { patientId: link.patientId, deviceToken };
  });

  if (!claim) return refused();

  const res = NextResponse.json({ patientId: claim.patientId });
  // The token leaves in a Set-Cookie header and NOT in the body: an httpOnly
  // cookie is unreadable to script, so an XSS in the portal cannot lift a
  // thirty-day credential out of a JSON response it can already see.
  res.headers.set("Set-Cookie", deviceCookie(claim.deviceToken));
  return res;
}
