import { NextResponse } from "next/server";

import { OtpCodeNotStored, hashPhone, requestCode } from "@/lib/auth/otp";
import { isSmsCapablePT } from "@osteojp/notify";
import { createDrizzleOtpStore } from "@/lib/auth/otp-store";
import { OtpTransportMisconfigured, resolveOtpTransport } from "@/lib/auth/otp-transport";
import { normalizePhonePT } from "@osteojp/notify";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import {
  RULES,
  clientKey,
  tooManyRequests,
  OTP_GLOBAL_HOUR_KEY,
  OTP_GLOBAL_DAY_KEY,
} from "@/lib/rate-limit/limiter";

// POST /api/v1/auth/otp/request — send a 6-digit login code by SMS.
// Decision D: patient login is a 6-digit SMS OTP, phone only.
//
// IT ALWAYS ANSWERS 204, whatever happened. Not out of laziness — this endpoint
// is the enumeration surface. A response that differed for a known and an
// unknown number would be a patient-list oracle for anyone with a phone book,
// and this clinic's patient list is itself sensitive. The only distinguishable
// outcomes are a malformed number (400, which reveals nothing about anyone) and
// rate limiting (429, which an unknown number hits identically).
//
// THAT SENTENCE IS A COMPLETENESS CLAIM, AND IT HAS BEEN FALSE ONCE. Recorded
// here rather than left as history, because the next person to add a branch to
// this function is the person who needs to know this comment is load-bearing
// and has to be RE-READ rather than merely preserved.
//
// SEC-otp-request-tenant-500-oracle, 2026-08-11: `tenantId` is taken from the
// body and validated only as a non-empty string, and `patient_otp_codes.tenant_id`
// carries REFERENCES tenants(id) (migration 0056:95). So a fabricated tenantId
// raised a foreign-key violation on the insert and this route answered 500 where
// a real one answered 204 - a THIRD distinguishable outcome, on the endpoint
// whose whole design is to have as few as possible, and one the paragraph above
// said did not exist.
//
// IT IS CLOSED, AND NOT BY THAT CARD. The try/catch below arrived with
// SEC-otp-unassigned-prefix-500 on 2026-08-13 for an unrelated reason, and it
// absorbs the FK violation too, because `store.create` runs inside `requestCode`
// inside that try. Re-derived from main rather than assumed. The claim above is
// true again as written, and `send-failure.test.ts` now holds it there.
//
// THE FIX IS DELIBERATELY NOT A tenantId LOOKUP, and this is the half worth
// keeping: validating the tenant against the tenants table would add a database
// query keyed on caller-supplied input to the endpoint whose stated property is
// that it performs none (see the paragraph below), and it would turn tenant
// existence from an accidental oracle into a fast, cheap, deliberate one.
//
// AND IT NEVER LOOKS THE PHONE UP. There is no patient query on this path at
// all, so membership cannot leak even through the timing of a lookup. WF-07
// resolves the patient at CLAIM time, on verify.
//
// RATE LIMITED BEFORE ANYTHING ELSE, copying auth/session/route.ts's posture, so
// an unauthenticated attacker cannot spend the clinic's SMS budget for free.
// TWO independent limits: per client key, and per phone. Either alone is
// bypassable — one by rotating the number, the other by rotating the source.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const store = createDurableRateLimitStore();

  // Per client, first: cheapest, and it caps an attacker before any parsing.
  const byClient = await checkDurableRateLimit(
    clientKey(req, "otp-request"),
    RULES.otpRequest,
    store,
  );
  if (!byClient.ok) return tooManyRequests(byClient);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const raw = (body as { phone?: unknown } | null)?.phone;
  const tenantId = (body as { tenantId?: unknown } | null)?.tenantId;
  if (typeof raw !== "string" || typeof tenantId !== "string" || tenantId === "") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // E.164 or nothing. A malformed number is the one thing worth distinguishing:
  // it tells the caller about their own input, never about our records.
  const phone = normalizePhonePT(raw);
  if (!phone) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // LANDLINE REJECTION (SEC-otp-unauthenticated-sms-pump, direction b).
  //
  // normalizePhonePT admits the `2` prefix - Portuguese geographic lines, which
  // cannot receive SMS - so before this the route paid to text them. Rejecting
  // here removes roughly half the accepted input space (2 x 10^8 -> 10^8) and
  // supplies the enforcement point PG1's own DoR requires for the landline
  // degradation case, which had none.
  //
  // IT REUSES `invalid_input` RATHER THAN NAMING ITSELF, and that is deliberate.
  // A distinct code would be safe to disclose - the numbering plan is public and
  // says nothing about our records - but it would still be a NEW distinguishable
  // outcome on the endpoint whose whole design is to have as few as possible,
  // and it would buy nothing: the portal is ruled not to branch on it. The three
  // standing degradation bullets at the login screen stay exactly as they are,
  // shown together and always, because branching to one of them is how the
  // screen becomes the oracle the API refuses to be.
  //
  // The check is HERE and not in normalizePhonePT: that function has five call
  // sites across two apps, two of them on the launch-critical reminder dispatch
  // path. See packages/notify/src/sms-capability.ts for the full reasoning.
  if (!isSmsCapablePT(phone)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Per phone, keyed by the HASH so no number is used as a rate-limit key in the
  // clear. Applied after normalization so "912345678" and "+351912345678"
  // cannot be spent as two separate budgets against the same handset.
  const byPhone = await checkDurableRateLimit(
    `otp-request:phone:${hashPhone(phone)}`,
    RULES.otpRequest,
    store,
  );
  if (!byPhone.ok) return tooManyRequests(byPhone);

  // THE GLOBAL SEND CEILING (direction a), and it is checked LAST ON PURPOSE.
  //
  // Every other gate above can refuse a request that would never have sent
  // anything: a malformed body, a bad number, a landline, a per-key limit. If
  // the ceiling were checked first, those would all SPEND global budget, and an
  // attacker could exhaust the clinic's daily allowance with garbage that costs
  // them nothing and us nothing in SMS - denying login to every real patient
  // without buying a single message. Checked here, one hit on the counter means
  // one message that was actually about to leave.
  //
  // TWO WINDOWS, BOTH CONSTANT-KEYED. Hour bounds a burst, day bounds the bill.
  // The hour is checked first so a burst trips the shorter window and the day's
  // budget is not spent by an attack the hour cap already stopped.
  //
  // NO ENUMERATION SIGNAL IS ADDED: the response is the same 429 every other
  // limit returns, and it is identical for a known and an unknown number,
  // because this limit never looks at the number at all.
  for (const [key, rule] of [
    [OTP_GLOBAL_HOUR_KEY, RULES.otpGlobalHour],
    [OTP_GLOBAL_DAY_KEY, RULES.otpGlobalDay],
  ] as const) {
    const verdict = await checkDurableRateLimit(key, rule, store);
    if (!verdict.ok) {
      // PG7, no silent degradation. Tripping this is an operational event -
      // either an attack or the clinic has outgrown the cap - and it must not be
      // discoverable only by a patient failing to log in. Key and limit only:
      // the key is a constant and carries no identity, and no phone, hash or
      // tenant is logged.
      console.error(
        `[otp] GLOBAL SEND CEILING REACHED: ${key} at limit ${rule.limit}. ` +
          `No OTP SMS will be sent until the window resets. This is either abuse ` +
          `or a cap that needs raising deliberately.`,
      );
      return tooManyRequests(verdict);
    }
  }

  // ================================================================= //
  // A FAILED SEND MUST NOT BECOME A FOURTH DISTINGUISHABLE OUTCOME.
  // ================================================================= //
  // SEC-otp-unassigned-prefix-500. This `await` was unwrapped, and apps/api has
  // no middleware.ts, so anything the transport threw became a 500 - a fourth
  // outcome on the one endpoint whose entire design is to have as few as
  // possible, arriving BY EXCEPTION rather than by decision.
  //
  // It was found by typing an unassigned 9x prefix, which Twilio cannot route.
  // BUT THE PREFIX IS THE SYMPTOM, NOT THE DEFECT. Every other provider-side
  // failure fell through the identical crack into the identical 500: a
  // suspended account, an exhausted balance, a destination-country permission
  // never enabled, Twilio's own rate limiting. Whatever the 500 discloses today,
  // it would disclose something else the first time the provider failed for a
  // different reason, and nobody would be watching. Catching here closes all of
  // them at once instead of the one number that happened to be typed.
  //
  // IT ALSO STOPPED MIS-ATTRIBUTING THE FAULT TO THE PATIENT. A 500 renders
  // `otp_unavailable` - "the service is unavailable, try later" - which invites a
  // patient to wait for something that will never work. A 204 renders
  // `otp_sent`, which is worded "if the number is registered" and is the honest
  // answer here: we accepted the request and cannot tell them more without
  // becoming an oracle. Whether an undeliverable number deserves its own pt-PT
  // copy is a separate PRODUCT question and is deliberately not decided here.
  try {
    await requestCode(tenantId, phone, {
      store: createDrizzleOtpStore(),
      transport: resolveOtpTransport(),
    });
  } catch (e) {
    // A DEPLOYMENT FAULT IS RE-THROWN. `OtpTransportMisconfigured` means the
    // live flag is armed with no credentials, which fails for EVERY patient and
    // is not a delivery problem. PG7's posture is that such a thing fails at
    // boot, loudly, rather than degrading into a cheerful 204 that silently
    // sends nothing to anyone. Discriminated by CLASS, never by message text:
    // a string match would fail open the moment somebody reworded the prose.
    if (e instanceof OtpTransportMisconfigured) throw e;

    // ================================================================= //
    // WHICH HALF FAILED DECIDES WHAT IS TRUE ABOUT THE DATABASE.
    // ================================================================= //
    // SEC-otp-request-tenant-500-oracle. This block said "the code row was
    // already written and is now live-but-undelivered" UNCONDITIONALLY, which
    // was true when it was written, because the only failure it absorbed was
    // the send. It now also absorbs a failed WRITE - a fabricated tenantId
    // raising the foreign-key violation on `patient_otp_codes.tenant_id` - and
    // for that branch the sentence is FALSE: there is no row, because writing
    // it is what failed.
    //
    // A LOG LINE ON A FAILURE PATH IS A VERDICT PATH. It is read exactly when
    // something has already gone wrong, by somebody who cannot see this code,
    // and it is the only account they get. Sending them to look for a row that
    // does not exist is section 1.3's collapse in miniature: two distinct
    // failures reported as one, and the one reported is the benign one.
    //
    // NEITHER BRANCH CHANGES THE RESPONSE. Both still answer 204 and both stay
    // byte-identical to a success. What is discriminated here is the LOG, never
    // the caller's view, so no distinguishable outcome is added by fixing this.
    if (e instanceof OtpCodeNotStored) {
      // NAMES AND CLASSES ONLY, NEVER THE PHONE, THE HASH OR THE CODE (PII rule
      // 7). The tenant is omitted too - it identifies the clinic, and on this
      // branch it is very likely attacker-supplied text besides.
      //
      // THE ORIGINAL ERROR IS READ OFF `cause`, not off the wrapper: the wrapper
      // exists to carry the FACT of which half failed, and the diagnostic value
      // is still in the driver's own error.
      const cause = e.cause;
      console.error(
        `[otp] CODE ROW NOT WRITTEN, request still answered 204: ` +
          `${cause instanceof Error ? cause.name : "unknown"}: ` +
          `${cause instanceof Error ? cause.message : "no message"}. NOTHING WAS SENT ` +
          `and NO row exists - do not go looking for a live-but-undelivered code. ` +
          `The ordinary cause is a tenantId that is not a real tenant, which this ` +
          `route accepts as any non-empty string on purpose; a repeat under a REAL ` +
          `tenant is a database fault worth naming.`,
      );
    } else {
      // NAMES AND CLASSES ONLY, NEVER THE PHONE, THE HASH OR THE CODE (PII rule
      // 7). The tenant is omitted too - it identifies the clinic, and this line
      // may be read by anyone with log access.
      //
      // AND IT SAYS THE ROW SURVIVES, because that is the non-obvious part.
      // `requestCode` writes the code row BEFORE sending, deliberately, so a
      // delivered code always has a record behind it. A throwing send therefore
      // leaves a live unused row with no delivery. It is bounded by the 3/hour
      // per-phone limit and the 5-minute TTL, so it is not an exhaustion vector -
      // but somebody reading that table later will wonder why codes exist that
      // nobody received, and this line is the answer.
      console.error(
        `[otp] SEND FAILED, request still answered 204: ${e instanceof Error ? e.name : "unknown"}: ` +
          `${e instanceof Error ? e.message : "no message"}. The code row was already ` +
          `written and is now live-but-undelivered until its TTL expires. If this ` +
          `repeats, the transport is failing for a reason worth naming, not one number.`,
      );
    }
  }

  // 204 regardless. See the header: this is the enumeration property.
  return new Response(null, { status: 204 });
}
