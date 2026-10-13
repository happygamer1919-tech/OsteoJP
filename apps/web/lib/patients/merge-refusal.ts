/**
 * REG-03: the patient merge's own refusal of one patient named as both sides,
 * told apart from every other check violation.
 *
 * `public.merge_patients` refuses a merge whose source and target are one
 * patient with SQLSTATE 23514 (`check_violation`), and `mergePatients`
 * (actions.ts) answers that with `InvalidMergeError`. 23514 names a kind of
 * refusal, not this one alone: any CHECK constraint of a table the function
 * writes raises it, and so does the registo immutability trigger, which fires
 * on the registos the function moves. Only the function's own refusal is the
 * self-merge answer. Any other 23514 leaves the action as the error it is.
 *
 * MATCHES ON THE SQLSTATE AND ON THE FUNCTION'S OWN MESSAGE, both on the same
 * layer of the error. The function raises this refusal with a message and
 * nothing else (no DETAIL, no constraint name), so the message is the one
 * field that names it. It is the function's text, written in
 * packages/db/migrations/0005_patient_merge_multilocation.sql, and not a
 * server message: no locale and no PostgreSQL version changes it. Only its
 * fixed start is compared; the patient id it ends with is not read.
 *
 * THE CAUSE CHAIN IS WALKED BECAUSE THE ERROR ARRIVES WRAPPED: Drizzle raises
 * its own `Failed query` error, which carries no SQLSTATE, and hangs the
 * driver's error off `.cause` (pinned against the real driver in
 * merge-refusals.db.test.ts). The same walk as `refusingForeignKey` in
 * lib/clinical/episode-key-refusal.ts.
 */

/** Postgres `check_violation`. */
const CHECK_VIOLATION = "23514";

/** How `public.merge_patients` begins its refusal of one patient as both sides. */
export const SELF_MERGE_REFUSAL = "merge_patients: source and target are the same patient";

/**
 * Was this the merge function's own refusal of one patient as both sides?
 * Decided on the first layer of the error chain that carries a check
 * violation; `false` when no layer carries one.
 */
export function isSelfMergeRefusal(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  for (let depth = 0; cur && typeof cur === "object" && depth < 4; depth++) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === CHECK_VIOLATION) {
      return typeof o.message === "string" && o.message.startsWith(SELF_MERGE_REFUSAL);
    }
    cur = o.cause;
  }
  return false;
}
