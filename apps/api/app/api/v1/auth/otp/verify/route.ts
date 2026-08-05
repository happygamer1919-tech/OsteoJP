import { NextResponse } from "next/server";

import { verifyCode } from "@/lib/auth/otp";
import { createDrizzleOtpStore } from "@/lib/auth/otp-store";
import { resolvePatientByProvenPhone } from "@/lib/auth/patient-linkage";
import { normalizePhonePT } from "@/lib/notify/phone";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import { RULES, clientKey, tooManyRequests } from "@/lib/rate-limit/limiter";

// POST /api/v1/auth/otp/verify — check a code and resolve the patient.
//
// EVERY FAILURE IS THE SAME 401 WITH THE SAME BODY. There are five ways to fail
// here and a caller can distinguish none of them: no code was requested, the
// code is wrong, it expired, its attempt cap is spent, or the phone resolves to
// zero / several / an already-claimed patient row. Two separate modules already
// enforce that internally — otp.ts and patient-linkage.ts each return one shared
// refusal object with no reason field — and this route's job is not to undo it
// by mapping outcomes onto different statuses.
//
// THE LINKAGE REFUSAL IS DELIBERATELY INDISTINGUISHABLE FROM A WRONG CODE, which
// is worth stating because it costs something real: a patient whose number is on
// two rows gets the same screen as someone who fat-fingered a digit, and cannot
// be told why. WF-07 accepted that. The alternative — "your number matches
// several records" — confirms to any caller that a given phone number is in this
// clinic's files, and how many times.
//
// WHAT THIS ROUTE DOES NOT DO YET: mint a session. That is the next step and it
// must happen in the SAME transaction as consuming the code, for the reason 0054
// couples a token action to its consumption record. Until then this returns the
// resolved patient id and nothing else — no cookie, no token, no session. That
// is deliberate rather than incomplete: shipping a half-built session mint is
// exactly what Decision D forbids.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The single refusal. Byte-identical for every failure mode. */
function refused(): Response {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  const store = createDurableRateLimitStore();

  // Before anything else, and fail-closed: if the durable store is unreachable
  // this refuses rather than allowing, because failing open here would turn a
  // database blip into an unlimited guessing window against a 6-digit code.
  const verdict = await checkDurableRateLimit(
    clientKey(req, "otp-verify"),
    RULES.otpVerify,
    store,
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

  const result = await verifyCode(b.tenantId, phone, b.code, {
    store: createDrizzleOtpStore(),
  });
  if (!result.ok) return refused();

  // The code is proven. Now, and only now, does the phone touch the patient
  // table — WF-07's "claim time". A refusal here looks identical to a wrong
  // code, by design.
  const link = await resolvePatientByProvenPhone(b.tenantId, phone);
  if (!link.ok) return refused();

  return NextResponse.json({ patientId: link.patientId });
}
