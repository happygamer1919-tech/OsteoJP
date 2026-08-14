import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDbAdmin, guestBookingRequests } from "@osteojp/db";

import { hashPhone } from "@/lib/auth/otp";
import { isSmsCapablePT } from "@/lib/auth/otp-sms-capability";
import { normalizePhonePT } from "@/lib/notify/phone";
import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import {
  RULES,
  clientKey,
  tooManyRequests,
  GUEST_BOOKING_GLOBAL_HOUR_KEY,
  GUEST_BOOKING_GLOBAL_DAY_KEY,
} from "@/lib/rate-limit/limiter";

/**
 * POST /api/v1/booking/guest — a booking REQUEST from somebody who is not a
 * patient. No account, no OTP. ITEM 6.
 *
 * THIS IS THE PROJECT'S FIRST UNAUTHENTICATED WRITE SURFACE, so the posture is
 * copied deliberately from the one endpoint that already faces the open
 * internet: auth/otp/request. Read that file alongside this one.
 *
 * R-GUEST-1 — EVERY REQUEST LANDS AS A REQUEST. There is no branch here that
 * confirms anything, whatever the slot's availability. `status` is defaulted by
 * the database and never set by this route, so a future edit cannot make this
 * path auto-confirm by passing a field.
 *
 * NOTHING CLINICAL IS TOUCHED. The insert goes to guest_booking_requests and
 * nowhere else: no patient row, no appointment, no notification. Reception
 * converts on confirm, with a human already looking.
 *
 * IT ANSWERS 202 WHETHER OR NOT THE PHONE MATCHES A PATIENT, and that is the
 * whole no-oracle property. The duplicate flag is computed for RECEPTION and
 * never reaches the caller — a response that differed would turn a public form
 * into a patient-list oracle for anyone with a phone book, which is precisely
 * what the OTP endpoint was designed to avoid one surface over.
 *
 * R9 — NO SMS IS SENT. Sending is disarmed, so the caller is told to expect a
 * call from the clinic and nothing leaves the building. The response carries no
 * confirmation token and promises no reservation: the slot is NOT held until
 * reception confirms, which is the same rule the pedido queue header states.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The IP, hashed. Never stored in the clear: an address is personal data under
 *  RGPD and the clinic has no purpose for the raw value. Abuse forensics only. */
function hashClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

type GuestBody = {
  tenantId?: unknown;
  fullName?: unknown;
  phone?: unknown;
  serviceId?: unknown;
  locationId?: unknown;
  practitionerId?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
};

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export async function POST(req: Request): Promise<Response> {
  const store = createDurableRateLimitStore();

  // PER SOURCE FIRST: cheapest, and it caps an attacker before any parsing.
  // Both windows, hour before day, so a burst trips the shorter one and the
  // day's budget is not spent by an attack the hour cap already stopped.
  for (const [key, rule] of [
    [clientKey(req, "guest-booking:hour"), RULES.guestBookingIp],
    [clientKey(req, "guest-booking:day"), RULES.guestBookingIpDay],
  ] as const) {
    const verdict = await checkDurableRateLimit(key, rule, store);
    if (!verdict.ok) return tooManyRequests(verdict);
  }

  let body: GuestBody | null;
  try {
    body = (await req.json()) as GuestBody;
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { tenantId, fullName, phone: rawPhone, serviceId, locationId, startsAt, endsAt } =
    body ?? {};
  if (
    !isNonEmptyString(tenantId) ||
    !isNonEmptyString(fullName) ||
    !isNonEmptyString(rawPhone) ||
    !isNonEmptyString(serviceId) ||
    !isNonEmptyString(locationId) ||
    !isNonEmptyString(startsAt) ||
    !isNonEmptyString(endsAt)
  ) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  // R-GUEST-2 collects a NAME, and a name is the one free-text field here.
  // Bounded so the queue cannot be filled with essays.
  if (fullName.trim().length > 120) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // E.164 or nothing, then the SMS-capability gate. Both reuse `invalid_input`
  // rather than naming themselves: they tell the caller about their OWN input
  // and never about our records, and adding a distinguishable outcome to a
  // public endpoint buys nothing here.
  //
  // isSmsCapablePT rejects Portuguese geographic (`2`) numbers. It matters even
  // though this flow sends no SMS: reception's ONLY way to reach this person is
  // to ring them, and a landline they typed by mistake is a request nobody can
  // action. Refusing at entry is better than a dead row in the queue.
  const phone = normalizePhonePT(rawPhone);
  if (!phone || !isSmsCapablePT(phone)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // PER PHONE, keyed by HASH so no number is a rate-limit key in the clear.
  // After normalisation, so "912345678" and "+351912345678" cannot be spent as
  // two budgets against one handset.
  for (const [key, rule] of [
    [`guest-booking:phone:hour:${hashPhone(phone)}`, RULES.guestBookingPhone],
    [`guest-booking:phone:day:${hashPhone(phone)}`, RULES.guestBookingPhoneDay],
  ] as const) {
    const verdict = await checkDurableRateLimit(key, rule, store);
    if (!verdict.ok) return tooManyRequests(verdict);
  }

  // THE TENANT-WIDE BACKSTOP, CHECKED LAST, for the reason the OTP route
  // records: every gate above can refuse a request that would never have
  // written anything, and if the global counter were spent by malformed input
  // an attacker could exhaust the day's allowance with garbage and deny the
  // form to real people without ever submitting a valid one.
  for (const [key, rule] of [
    [GUEST_BOOKING_GLOBAL_HOUR_KEY, RULES.guestBookingGlobalHour],
    [GUEST_BOOKING_GLOBAL_DAY_KEY, RULES.guestBookingGlobalDay],
  ] as const) {
    const verdict = await checkDurableRateLimit(key, rule, store);
    if (!verdict.ok) return tooManyRequests(verdict);
  }

  // SERVICE ROLE, and rule 3 binds here: tenant_id is set EXPLICITLY. The table
  // has no anon policy in either direction, so this is the only write path, and
  // it is guarded by everything above rather than by a WITH CHECK expression
  // that has to survive future edits.
  const db = getDbAdmin();
  await db.insert(guestBookingRequests).values({
    tenantId,
    fullName: fullName.trim(),
    phone,
    serviceId,
    locationId,
    practitionerId: isNonEmptyString(body?.practitionerId) ? body.practitionerId : null,
    requestedStartsAt: start,
    requestedEndsAt: end,
    sourceIpHash: hashClientIp(req),
    // `status` is NOT set. The database defaults it to 'pending' and a CHECK
    // pins the vocabulary, so R-GUEST-1 cannot be broken by adding a field to
    // this object.
  });

  // 202 ACCEPTED, ALWAYS, and identical for a phone that matches a patient and
  // one that does not. The possible-existing-patient flag is computed for
  // reception when the queue is READ, never here, so this response cannot carry
  // it even by accident.
  //
  // No token, no reservation, no SMS (R9). The caller shows the on-screen
  // confirmation and tells the person the clinic will make contact.
  return NextResponse.json({ status: "received" }, { status: 202 });
}

/**
 * Reception's "possible existing patient" flag, for the queue read.
 *
 * FLAG, NEVER LINK. Exported from here so the rule sits beside the endpoint it
 * qualifies, and so nothing on the write path can reach it. 0062's precedent is
 * explicit: resolvePatientByProvenPhone REFUSES on several matches rather than
 * picking one, because mis-linking a medical record is the worst outcome
 * available. This returns a COUNT for the same reason - reception is told "this
 * may be somebody you already have", and a human decides.
 *
 * It matches on phone_e164 at BOTH ends, which is why 0063 carries 0062's
 * generated-column expression verbatim. GUEST-02 requires a parity test over
 * the two before the flow ships: if they ever normalise differently this
 * returns 0 and a returning patient is silently treated as new.
 */
export async function countPossiblePatientMatches(
  tenantId: string,
  guestRequestId: string,
): Promise<number> {
  const db = getDbAdmin();
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from public.patients p
    join public.guest_booking_requests g
      on g.phone_e164 = p.phone_e164
    where g.id = ${guestRequestId}
      and g.tenant_id = ${tenantId}
      and p.tenant_id = ${tenantId}
      and p.phone_e164 is not null
  `);
  return rows[0]?.n ?? 0;
}
