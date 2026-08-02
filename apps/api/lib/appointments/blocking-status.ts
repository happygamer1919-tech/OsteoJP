// The ONE definition of "which appointment statuses occupy a slot".
//
// This set is expressed in THREE places and they must never drift:
//
//   1. apps/api/lib/appointments/store.ts   — the patient booking conflict guard
//   2. packages/db/migrations/0052_...sql (therapist branch) — appointment_conflicts(), therapist
//   3. packages/db/migrations/0052_...sql (room branch) — appointment_conflicts(), room
//
// (2) and (3) live inside a SECURITY DEFINER function and are GREEN's lane.
// blocking-status.test.ts reads those migration files as text and asserts all
// three express the SAME set, so a change to one that is not mirrored in the
// others fails CI rather than being caught by review. That test is the reason
// this constant exists; a comment claiming the three agree would be worth
// nothing, since this repo already has a track record of comments that assert
// guarantees nobody checks.
//
// S1 APPLIED (migration 0052 + store.ts, one PR). A no_show RELEASES its slot:
// the patient did not attend, the therapist was in fact free, and the row is
// historical. `completed` stays blocking on conservative grounds - an overlap
// with a completed session is always a data error and rejecting it costs
// nothing.

/** Statuses that occupy a slot. */
export const BLOCKING_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
] as const;

/** Statuses that release a slot. */
export const NON_BLOCKING_STATUSES = ["cancelled", "no_show"] as const;
