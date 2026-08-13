// W13-03 / WF-07 (R4) — resolve a proven phone number to exactly one patient.
//
// RULING, verbatim: "phone-match at OTP claim time, per Decision D. If EXACTLY
// ONE live patient row (deleted_at null, merged_into_id null, auth_user_id
// null) carries the proven phone, link it. Zero matches, multiple matches, or
// any candidate already linked: REFUSE with a clear pt-PT message directing the
// patient to the clinic. Mis-linking a medical record is the failure class the
// refusal exists to prevent."
//
// IT IS FAIL-CLOSED AND IT WILL REFUSE REAL PATIENTS. A shared household
// number, a clinic row holding an old number, a patient with a duplicate row:
// all refuse. That is the trade the owner made explicitly, and the arithmetic
// behind it is not close. A refused login costs a phone call. A mis-link hands
// one patient another patient's clinical history.
//
// THE REFUSAL NEVER SAYS WHICH PREDICATE FAILED. "No row", "several rows" and
// "already claimed" are three different disclosures about who else exists in
// this clinic's records, and a caller who can distinguish them can enumerate
// patients by phone number. Same reasoning as the token rejection under
// counsel's section 3, and the same shape as the OTP refusal in otp.ts: one
// shared object, no reason field for a route to branch on.

import { and, eq, isNull } from "drizzle-orm";
import { getDbAdmin, patients } from "@osteojp/db";

import type { OtpDb } from "./otp-store";

/**
 * The whole result. `ok:false` carries NOTHING, deliberately — see the header.
 * If this ever grows a reason, the enumeration property is gone.
 */
export type LinkageResult = { ok: true; patientId: string } | { ok: false };

/** The single refusal, shared so divergence takes effort. */
const REFUSED: LinkageResult = { ok: false };

/**
 * Find the one live, unlinked patient row carrying this phone.
 *
 * ALL FOUR PREDICATES ARE IN THE QUERY, not applied afterwards in JS, so a
 * future edit cannot accidentally widen the candidate set by dropping a filter
 * from a later loop:
 *   deleted_at IS NULL      — not soft-deleted
 *   merged_into_id IS NULL  — not the losing side of a patient merge
 *   auth_user_id IS NULL    — not already claimed by someone
 *   tenant_id = ...         — never cross-tenant, even for a matching number
 *
 * LIMIT 2, NOT LIMIT 1, and that is the load-bearing detail. The rule needs to
 * distinguish "exactly one" from "more than one", and LIMIT 1 cannot: it
 * returns the same single row in both cases, silently turning an ambiguous
 * match into a confident mis-link. Two rows is all it takes to know there is
 * more than one, so nothing larger is fetched.
 *
 * IT TAKES THE CALLER'S DB HANDLE so the claim path can run this read INSIDE the
 * transaction that consumes the code. Read on one connection and consumed on
 * another, "exactly one live row" would be a fact about a moment already past by
 * the time anything acted on it.
 *
 * ===================================================================== //
 * IT MATCHES `phone_e164`, NOT `phone`, AND THAT IS THE FIX FOR A DEFECT
 * THAT STOPPED MOST PATIENTS LOGGING IN.
 * ===================================================================== //
 *
 * This compared `eq(patients.phone, phoneE164)` until 2026-08-13 — an exact
 * string match against a FREE-TEXT column. `optionalText`
 * (apps/web/lib/patients/validation.ts:117-124) trims it and normalizes nothing,
 * and phone.ts's own header says numbers arrive as "912 345 678",
 * "00351912345678", "+351 912-345-678". So a patient stored the way a human
 * writes a number - which is every patient in the e2e seed but one, and every
 * number a receptionist types - could not log in AT ALL. They received the SMS
 * code, typed it correctly, and were refused with the same single string a
 * WRONG code produces, because the API deliberately collapses all six failure
 * modes into one response. Decision D left no other door.
 *
 * `phone_e164` (migration 0062) is GENERATED ALWAYS from `phone` by the
 * database, so it cannot drift from it and no write path can forget to set it.
 * `phone` itself is untouched: it is what the receptionist typed and it stays
 * exactly that.
 *
 * NULL NEVER MATCHES, WHICH IS THE BEHAVIOUR WE WANT. A patient whose stored
 * number is not a valid PT subscriber number derives NULL, and `eq` on NULL is
 * never true in SQL, so they are refused rather than matched loosely. The
 * refusal is honest - they genuinely cannot be identified by that number - and
 * `caller` here has already proven a well-formed E.164, so the argument side is
 * never NULL.
 *
 * WHY NOT NORMALIZE IN TYPESCRIPT AT READ TIME. It would turn an indexed
 * equality on a PRE-AUTHENTICATION endpoint into a scan of every patient in the
 * tenant. That endpoint is the one an unauthenticated caller can reach.
 */
export async function resolvePatientByProvenPhone(
  tenantId: string,
  phoneE164: string,
  db: OtpDb = getDbAdmin(),
): Promise<LinkageResult> {
  const rows = await db
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.tenantId, tenantId),
        eq(patients.phoneE164, phoneE164),
        isNull(patients.deletedAt),
        isNull(patients.mergedIntoId),
        isNull(patients.authUserId),
      ),
    )
    .limit(2);

  if (rows.length !== 1) return REFUSED;
  return { ok: true, patientId: rows[0]!.id };
}
