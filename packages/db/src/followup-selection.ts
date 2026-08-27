/**
 * RB-01 — the recuperacao SELECTION PREDICATE, in one place.
 *
 * ==========================================================================
 * WHY THIS LIVES IN `packages/db` AND NOT BESIDE THE QUERY THAT USES IT
 * ==========================================================================
 * It has exactly two readers: the staff query in `apps/web/lib/followup`, and
 * the DB-gated test that proves it against a real Postgres. **A copy in each is
 * how the two come to disagree**, and this project has just paid for that
 * failure at full price: `LE-apply-block-expectation-drift`, carded 2026-08-20,
 * records a verification whose expectation was written for one version of a
 * function, never regenerated when the function changed, and which then fired a
 * FALSE STOP mid-apply on a production database.
 *
 * The same shape was one step away here. The obvious thing was to build the
 * predicate inline in the query and re-type it in the test. It would have
 * passed on the day and drifted on the first change to the rule — and a drifted
 * selection test does not fail, it goes green while asserting yesterday's rule.
 *
 * `guest-preferred-window.ts` sits beside this file for the same reason, in its
 * own words: exported from the package rather than from either app "because a
 * copy in each is how the two would come to disagree about what a window says".
 *
 * ==========================================================================
 * RAW SQL TEXT, NOT DRIZZLE FRAGMENTS, AND THAT IS THE POINT
 * ==========================================================================
 * The test drives `postgres` directly and the app drives Drizzle. A Drizzle
 * fragment would be usable by one of them. Plain parameterised SQL over a
 * caller-named patient-id expression is usable by both, which is the only way
 * ONE definition can serve both readers.
 *
 * `$1`, `$2`, `$3` are POSITIONAL and their meaning is fixed here so a caller
 * cannot bind them in the wrong order: 1 = window start, 2 = window end,
 * 3 = now.
 */

/**
 * What the placeholders mean, so a caller binds them right.
 *
 * `therapistUserId` ($4) is used ONLY by `followupOwnPatientClause`. A caller
 * building the three-clause predicate binds three; a caller adding the therapist
 * scope binds four. It is listed here rather than documented separately so the
 * positions cannot drift apart.
 */
export const FOLLOWUP_BINDINGS = ["windowFrom", "windowTo", "now", "therapistUserId"] as const;

/**
 * Clause 1 — the patient's MOST RECENT completed attendance falls in the window.
 *
 * NOT "has some completed attendance in the window". A patient seen in July AND
 * again three days ago would satisfy that and be rung about a visit they made
 * on Tuesday. `max(...)` says the thing the rule means; full reasoning in
 * `apps/web/lib/followup/window.ts`.
 */
export function followupLastAttendanceClause(patientIdExpr: string): string {
  return `(
    SELECT max(done.starts_at)
      FROM appointments done
     WHERE (done.patient_id = ${patientIdExpr} OR done.patient_2_id = ${patientIdExpr})
       AND done.status = 'completed'
  ) BETWEEN $1 AND $2`;
}

/**
 * Clause 2 — nothing on the books ahead of them.
 *
 * `cancelled` AND `no_show` ARE NOT BOOKINGS. A cancelled future appointment is
 * precisely the case this list exists to catch: the patient dropped out and
 * nobody noticed. Counting it as a booking would hide the patient who most
 * needs the call, and it would do so silently, because the row still exists and
 * still looks like an appointment.
 */
export function followupNoFutureBookingClause(patientIdExpr: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM appointments fut
     WHERE (fut.patient_id = ${patientIdExpr} OR fut.patient_2_id = ${patientIdExpr})
       AND fut.starts_at > $3
       AND fut.status NOT IN ('cancelled', 'no_show')
  )`;
}

/**
 * Clause 3 — not currently postponed.
 *
 * ACTIVE means `revoked_at IS NULL AND postponed_until > now`, which is exactly
 * the shape 0067's partial index covers. A revoked postponement is history and
 * must not keep the patient off the list; an EXPIRED one must not either, which
 * is why the comparison is against `now` and not merely a presence check.
 */
export function followupNotPostponedClause(patientIdExpr: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM patient_followup_postponements p
     WHERE p.patient_id = ${patientIdExpr}
       AND p.revoked_at IS NULL
       AND p.postponed_until > $3
  )`;
}

/**
 * ====================================================================
 * Clause 4 - THE THERAPIST SCOPE. Owner ruling 2026-08-27.
 * ====================================================================
 * The patient's MOST RECENT COMPLETED CONSULTATION was with `$4`.
 *
 * ==========================================================================
 * WHY THIS RULING EXISTS AND WHAT IT PRESERVES
 * ==========================================================================
 * A therapist previously got nothing here, and the reason was never "therapists
 * do not need it" - it was that **this page is every patient's telephone number
 * in one place**, with no per-recipient rule for RLS to enforce. `permissions.ts`
 * said so in as many words, and it said the test for a separate capability is
 * whether a therapist-shaped subset exists.
 *
 * The owner has now named that subset: **their own patients**. So the reasoning
 * is not overturned, it is satisfied - a therapist sees the people they treated,
 * which is a set they already know by name, and never the front desk's whole
 * call list.
 *
 * ==========================================================================
 * "MOST RECENT", NOT "EVER" - AND THE DIFFERENCE IS THE WHOLE CLAUSE
 * ==========================================================================
 * `EXISTS (... practitioner_id = $4 ...)` would have been one line shorter and
 * would mean something else entirely: every therapist who has EVER seen the
 * patient, including one who saw them once in February. Two therapists would
 * then both hold the same patient, and the row's own "practitioner" column -
 * which names the clinician of the LAST visit - would contradict the scope that
 * admitted it for one of them.
 *
 * So this is the same subquery shape as `followupPractitionerSql`: same
 * completed set, same `ORDER BY starts_at DESC LIMIT 1`. **The row this clause
 * tests is by construction the row whose practitioner the page displays**, which
 * is a property worth more than the line it costs - the scope and the screen
 * cannot disagree.
 *
 * ==========================================================================
 * PRIMARY PRACTITIONER ONLY, AND THAT IS THE SCHEMA'S RULE, NOT A CHOICE
 * ==========================================================================
 * `appointments.practitioner_2_id` exists, and the schema is explicit about what
 * it is: "PRIMARY-ONLY SEMANTICS everywhere - availability, the auto-selects,
 * analytics money attribution, the AI-recording primary pair and the
 * Estado/lifecycle axes ALL stay on the primary pair", with the secondary as
 * de-emphasised linked display data. `followupPractitionerSql` reads the primary
 * for the same reason.
 *
 * THE COST IS REAL AND IS NAMED RATHER THAN HIDDEN: a therapist who was the
 * SECOND clinician on a dual-therapist session does not get that patient on
 * their list. The alternative - scoping on either column while the screen names
 * only the primary - would show a therapist a patient whose row says somebody
 * else saw them, which is the more confusing of the two failures. If the owner
 * wants dual-therapist sessions to count for both, that is a ruling and a
 * one-line change here, and the display column has to change with it.
 *
 * THE PATIENT SIDE KEEPS BOTH COLUMNS (`patient_id OR patient_2_id`), matching
 * the three clauses above. Those ask "is this appointment this patient's", which
 * is a different question from "whose appointment is it".
 */
export function followupOwnPatientClause(patientIdExpr: string): string {
  return `(
    SELECT done.practitioner_id
      FROM appointments done
     WHERE (done.patient_id = ${patientIdExpr} OR done.patient_2_id = ${patientIdExpr})
       AND done.status = 'completed'
     ORDER BY done.starts_at DESC
     LIMIT 1
  ) = $4`;
}

/** The whole predicate, ANDed, for a caller that wants all three. */
export function followupSelectionPredicate(patientIdExpr: string): string {
  return [
    followupLastAttendanceClause(patientIdExpr),
    followupNoFutureBookingClause(patientIdExpr),
    followupNotPostponedClause(patientIdExpr),
  ].join("\n  AND ");
}

/* ==================================================================== */
/* THE TWO SELECT EXPRESSIONS. INC 2026-08-21.                          */
/* ==================================================================== */
/**
 * The patient's most recent completed attendance, as SQL text with an EXPLICIT
 * outer reference.
 *
 * ==========================================================================
 * THESE EXIST BECAUSE THE PAGE CRASHED IN PRODUCTION, AND IT IS THE SAME BUG
 * `packLinkedCountSql` WAS WRITTEN FOR, IN THE FILE NEXT DOOR, ONE DAY LATER.
 * ==========================================================================
 * `apps/web/lib/followup/queries.ts` built these two subqueries inline and
 * interpolated the Drizzle column:
 *
 *     sql`... WHERE (done.patient_id = ${patients.id} OR ...)`
 *
 * Drizzle renders that as the BARE `"id"`, not `"patients"."id"`. Inside
 * `FROM appointments done` the unqualified `"id"` resolves to **`done.id`**, so
 * the predicate reads `done.patient_id = done.id`, which is never true.
 * `max()` over zero rows returns **NULL**, and `page.tsx` then called
 * `toLocaleDateString` on it - a TypeError inside a Server Component, which is
 * the digest-only error the owner saw.
 *
 * THE WHERE CLAUSE WAS NEVER WRONG. It used the qualified builders above, so
 * the RIGHT patients were selected and their date came back null. The crash
 * therefore fires only when the list has at least one row - which is why it hit
 * the OWNER first: he sees every patient in the tenant, so he is the most likely
 * to have one.
 *
 * WHY THE FIX IS A SHARED BUILDER AND NOT A ONE-CHARACTER EDIT: the same
 * mistake, in the same shape, has now happened twice in two days. Both times the
 * cure was to make the CALLER name the outer column. `pack-balance.ts` says the
 * same thing about the same failure; these live here so the recuperação page has
 * one place where correlation is spelled out, and `followup-sql.test.ts` pins
 * what they render.
 */
export function followupLastAttendanceSql(patientIdExpr: string): string {
  return `(
  SELECT max(done.starts_at)
    FROM appointments done
   WHERE (done.patient_id = ${patientIdExpr} OR done.patient_2_id = ${patientIdExpr})
     AND done.status = 'completed'
)`;
}

/**
 * The practitioner of THAT attendance, not "a practitioner who has seen them".
 *
 * Reception opens with "o Dr. X gostaria de saber como está", and naming the
 * wrong clinician is worse than naming none. `ORDER BY starts_at DESC LIMIT 1`
 * over the same completed set, so it can only be the practitioner of the visit
 * the date refers to.
 */
export function followupPractitionerSql(patientIdExpr: string): string {
  return `(
  SELECT u.full_name
    FROM appointments done
    JOIN users u ON u.id = done.practitioner_id
   WHERE (done.patient_id = ${patientIdExpr} OR done.patient_2_id = ${patientIdExpr})
     AND done.status = 'completed'
   ORDER BY done.starts_at DESC
   LIMIT 1
)`;
}
