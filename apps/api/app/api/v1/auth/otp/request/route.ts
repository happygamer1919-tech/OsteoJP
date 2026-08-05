import { NextResponse } from "next/server";

import { hashPhone, requestCode } from "@/lib/auth/otp";
import { createDrizzleOtpStore } from "@/lib/auth/otp-store";
import { resolveOtpTransport } from "@/lib/auth/otp-transport";
import { normalizePhonePT } from "@/lib/notify/phone";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import { RULES, clientKey, tooManyRequests } from "@/lib/rate-limit/limiter";

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

  // Per phone, keyed by the HASH so no number is used as a rate-limit key in the
  // clear. Applied after normalization so "912345678" and "+351912345678"
  // cannot be spent as two separate budgets against the same handset.
  const byPhone = await checkDurableRateLimit(
    `otp-request:phone:${hashPhone(phone)}`,
    RULES.otpRequest,
    store,
  );
  if (!byPhone.ok) return tooManyRequests(byPhone);

  await requestCode(tenantId, phone, {
    store: createDrizzleOtpStore(),
    transport: resolveOtpTransport(),
  });

  // 204 regardless. See the header: this is the enumeration property.
  return new Response(null, { status: 204 });
}
