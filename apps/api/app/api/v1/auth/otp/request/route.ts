import { NextResponse } from "next/server";

import { hashPhone, requestCode } from "@/lib/auth/otp";
import { isSmsCapablePT } from "@/lib/auth/otp-sms-capability";
import { createDrizzleOtpStore } from "@/lib/auth/otp-store";
import { resolveOtpTransport } from "@/lib/auth/otp-transport";
import { normalizePhonePT } from "@/lib/notify/phone";
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
  // path. See otp-sms-capability.ts for the full reasoning.
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

  await requestCode(tenantId, phone, {
    store: createDrizzleOtpStore(),
    transport: resolveOtpTransport(),
  });

  // 204 regardless. See the header: this is the enumeration property.
  return new Response(null, { status: 204 });
}
