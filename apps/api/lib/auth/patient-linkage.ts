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
 */
export async function resolvePatientByProvenPhone(
  tenantId: string,
  phoneE164: string,
): Promise<LinkageResult> {
  const rows = await getDbAdmin()
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.tenantId, tenantId),
        eq(patients.phone, phoneE164),
        isNull(patients.deletedAt),
        isNull(patients.mergedIntoId),
        isNull(patients.authUserId),
      ),
    )
    .limit(2);

  if (rows.length !== 1) return REFUSED;
  return { ok: true, patientId: rows[0]!.id };
}
