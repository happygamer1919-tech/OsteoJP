import "server-only";

import { eq, isNotNull, isNull, type Column, type SQL } from "drizzle-orm";
import { patients } from "@osteojp/db";

/**
 * GUEST-06 — the ONE definition of "an existing patient with this number".
 *
 * TWO CALLERS ASK THIS QUESTION AND THEY MUST NEVER DISAGREE:
 *
 *   1. `listPendingGuestRequests` COUNTS matches, to mark a queue row "Novo
 *      cliente" or "Poderá já ser paciente".
 *   2. `convertGuestRequest` LISTS them, so reception can pick one — and REFUSES
 *      any patient outside the list, which is where flag-never-link is actually
 *      enforced.
 *
 * If the count and the list drifted apart, the queue would say "1 possible
 * match" and the convert dialog would open empty, or worse the reverse: a
 * patient the flag never counted would still be attachable. So the predicate is
 * built here, once, and both callers pass it a different left-hand side —
 * a COLUMN for the correlated subquery, a literal STRING for the direct read.
 *
 * ===========================================================================
 * `deleted_at IS NULL` IS A FIX, NOT A PRECAUTION, AND IT SHIPPED WRONG
 * ===========================================================================
 * GUEST-03's count subquery had no soft-delete filter. `patients` soft-deletes
 * (schema.ts:640, "records must never truly disappear"), so a DELETED patient
 * sharing a number marked a genuinely new caller "Poderá já ser paciente" — and
 * the mark is the whole point of that row. It never surfaced because nothing
 * could act on the flag yet; convert is what makes it act, and it is the reason
 * this predicate got read closely enough to notice.
 *
 * WHAT IT WOULD HAVE COST HERE, which is worse than a wrong badge: reception
 * would have been offered a deleted patient as the person to attach a live
 * appointment to. A soft-deleted record is one somebody decided should stop
 * being used; re-attaching it through a side door is not a decision anybody made.
 *
 * `phone_e164 IS NOT NULL` is the same class of guard. The column is GENERATED
 * ALWAYS and is null for a number the expression cannot parse. SQL would already
 * answer false for `NULL = NULL`, so this changes no result — it states the
 * intent, because a reader who assumes the two nulls match would read the
 * absence as a bug and "fix" it.
 */
/**
 * THE TENANT PREDICATE STAYS EXPLICIT even though every caller runs inside
 * `runScoped` and RLS already confines `patients` to the caller's tenant. It is
 * the project's stated shape - "server-side check in every API route + RLS as
 * defense-in-depth" - and this is the one predicate in the product that decides
 * whether two people are the same person. Dropping it because it is currently
 * redundant would make RLS the only thing standing between a guest request and
 * another clinic's patient list.
 */
export function patientPhoneMatchConds(
  tenantId: Column | SQL | string,
  phoneE164: Column | SQL | string,
) {
  return [
    eq(patients.tenantId, tenantId),
    isNotNull(patients.phoneE164),
    eq(patients.phoneE164, phoneE164),
    isNull(patients.deletedAt),
  ];
}
