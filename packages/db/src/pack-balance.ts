/**
 * RB-02 — what a pacote's balance IS, in one place.
 *
 * ==========================================================================
 * THE MODEL, AND WHY IT NEEDS TWO TERMS RATHER THAN ONE
 * ==========================================================================
 * Before 0067 a pacote's remaining sessions were a COUNTER, `sessions_remaining`,
 * decremented on booking and adjustable by hand. Nothing could reconcile it
 * against the diary: a session had no appointment, so no who, no when and no
 * slot. That is the defect this card exists to close.
 *
 * The obvious replacement — count the appointments linked to the instance — is
 * WRONG ON ITS OWN, and wrong in the direction that quietly gives things away.
 * Every pacote bought before 0067 has ZERO linked appointments, because the link
 * column did not exist, so a pure derive-from-rows model reads every one of them
 * as untouched and RESTORES every session already used. That is fabricating
 * sessions: the mirror image of fabricating appointment rows, and it would land
 * on real patients' balances the day it shipped.
 *
 * So the balance has two terms:
 *
 *     available = sessionsTotal - legacyConsumed - linkedAppointments
 *
 * `legacy_consumed` records WHAT IS KNOWN about the past — how many, never which
 * — and 0067's backfill set it to `sessions_total - sessions_remaining`, an
 * arithmetic identity. With zero linked rows the formula returns exactly the
 * balance the row already carried, for every row, with no case analysis. Every
 * existing balance came out unchanged, which the apply proved: V3 found zero
 * rows where the identity failed.
 *
 * ==========================================================================
 * WHICH APPOINTMENTS COUNT, AND WHY `consumir` IS GONE RATHER THAN REPLACED
 * ==========================================================================
 * A `cancelled` appointment does NOT consume a session. Everything else does —
 * `scheduled`, `confirmed`, `completed` and **`no_show`**.
 *
 * That last one is the whole reason the manual "consumir" button can be deleted
 * rather than reimplemented. It existed for the under-24h / no-show rule: the
 * patient did not come, the clinic still spends the session. Under this model
 * the no-show IS an appointment row with `status = 'no_show'`, so it counts by
 * itself. The rule is now a consequence of the data instead of a button
 * somebody has to remember to press — and it can no longer be applied to a
 * patient with no appointment at all, which is what made the old counter
 * unreconcilable in the first place.
 */

/** The appointment statuses that consume a pacote session. */
export const PACK_CONSUMING_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
] as const;

/**
 * SQL predicate naming the consuming statuses, for the count subquery.
 * Written as a NOT-cancelled test rather than an IN list on purpose: the
 * appointment_status enum may gain a value, and a new status should default to
 * CONSUMING. Getting that backwards gives a patient a free session for a state
 * nobody thought about, silently; getting it this way charges one and somebody
 * complains, which is the failure that gets fixed.
 */
export const PACK_CONSUMING_STATUS_SQL = `status <> 'cancelled'`;

export type PackBalanceInputs = {
  sessionsTotal: number;
  legacyConsumed: number;
  /** Appointments linked to this instance whose status consumes a session. */
  linkedAppointments: number;
};

/**
 * Sessions still available on an instance.
 *
 * CLAMPED AT ZERO, and this is the one place a clamp is right rather than the
 * §1.3 anti-pattern: it is not hiding an unknown case behind a known-looking
 * one. A negative balance is arithmetically reachable — an admin can mark a
 * cancelled appointment as attended again, or 0067's backfill met a row whose
 * counter had been hand-adjusted below zero before the CHECK existed — and
 * "minus one session" is not a thing the clinic can act on. The raw terms stay
 * available to any caller that wants to see the overdraw; only the DISPLAY
 * number is clamped.
 */
export function packSessionsAvailable(i: PackBalanceInputs): number {
  return Math.max(0, i.sessionsTotal - i.legacyConsumed - i.linkedAppointments);
}

/** True when the instance has sessions left to book. */
export function packIsActive(i: PackBalanceInputs): boolean {
  return packSessionsAvailable(i) > 0;
}

/**
 * Sessions consumed, for display beside the total.
 *
 * NOT `total - available`, because that would hide an overdraw the moment the
 * clamp above bites. This is the honest count of what has been spent, and it
 * can exceed the total.
 */
export function packSessionsConsumed(i: PackBalanceInputs): number {
  return i.legacyConsumed + i.linkedAppointments;
}

/**
 * The linked-appointment count, as SQL text with an EXPLICIT outer reference.
 *
 * ==========================================================================
 * THIS FUNCTION EXISTS BECAUSE THE OBVIOUS DRIZZLE VERSION WAS SILENTLY WRONG
 * ==========================================================================
 * The first implementation interpolated the Drizzle column into the subquery:
 *
 *     sql`... WHERE a.pack_instance_id = ${patientPackInstances.id} ...`
 *
 * Drizzle rendered that as **`a.pack_instance_id = "id"`** - the BARE column
 * name, not `"patient_pack_instances"."id"`. Inside `FROM appointments a` the
 * unqualified `"id"` resolves to **`a.id`**, so the predicate became
 * `a.pack_instance_id = a.id`, which is never true.
 *
 * **It did not error. It returned 0 for every instance**, so every pacote read
 * as untouched and the agenda banner showed 10/10 after a booking. A wrong
 * answer wearing the face of a valid one: PORTAL-REHYDRATE §1.3, in a query.
 *
 * It was caught by an E2E screenshot, and it is worth naming what did NOT catch
 * it: the DB-gated test asserted the PREDICATE STRINGS against real Postgres and
 * passed, because those strings were never the broken part. The broken part was
 * how Drizzle rendered a correlation, which no test looked at.
 *
 * So the caller now NAMES the outer column, exactly as `followup-selection.ts`
 * makes its caller name the patient-id expression, and
 * `pack-balance.test.ts` pins the generated SQL.
 */
export function packLinkedCountSql(instanceIdExpr: string): string {
  return `(
  SELECT count(*)::int FROM appointments a
   WHERE a.pack_instance_id = ${instanceIdExpr}
     AND a.${PACK_CONSUMING_STATUS_SQL}
)`;
}

/**
 * RB-02b — may this batch be booked against this pacote?
 *
 * ==========================================================================
 * A REFUSAL, NEVER A TRUNCATION, AND THE DECISION IS ITS OWN FUNCTION
 * ==========================================================================
 * Booking eight of the ten asked for looks like success. Reception closes the
 * drawer, and the two that were dropped are discovered later from the diary, by
 * somebody who has no way to tell them from appointments nobody ever made. That
 * is PORTAL-REHYDRATE §1.3 exactly: an unhandled case wearing the face of a
 * harmless one.
 *
 * IT KEYS ON WHAT WAS REQUESTED, NOT ON WHAT IS BOOKABLE. A batch of five
 * against a pacote with three left is refused even if two of the five slots are
 * busy and only three would have been written. The person asked for five
 * sessions from a pacote that has three; that is the error, and how many of them
 * happen to be free is a different question with a different answer (partial
 * success, reported per slot).
 *
 * PURE, so the boundary is testable without a database and without a drawer.
 */
export function packBatchIsOverbooked(requested: number, available: number): boolean {
  return requested > available;
}
