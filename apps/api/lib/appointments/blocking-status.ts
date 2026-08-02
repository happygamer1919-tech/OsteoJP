// The ONE definition of "which appointment statuses occupy a slot".
//
// This set is expressed in THREE places and they must never drift:
//
//   1. apps/api/lib/appointments/store.ts   — the patient booking conflict guard
//   2. packages/db/migrations/0048_...sql:77 — appointment_conflicts(), therapist
//   3. packages/db/migrations/0048_...sql:91 — appointment_conflicts(), room
//
// (2) and (3) live inside a SECURITY DEFINER function and are GREEN's lane.
// blocking-status.test.ts reads those migration files as text and asserts all
// three express the SAME set, so a change to one that is not mirrored in the
// others fails CI rather than being caught by review. That test is the reason
// this constant exists; a comment claiming the three agree would be worth
// nothing, since this repo already has a track record of comments that assert
// guarantees nobody checks.
//
// PENDING RULING (S1, not yet applied): the blocking set is to become
// scheduled + confirmed + completed, i.e. `no_show` STOPS blocking, on the
// grounds that a no-show released the slot and is historical. Today all three
// sites say `<> 'cancelled'`, which BLOCKS on no_show. Applying S1 to this file
// alone would put it out of step with (2) and (3) and correctly turn the
// agreement test red, so the flip must land together with GREEN's migration.

/** Statuses that currently occupy a slot (today's behaviour: everything but cancelled). */
export const BLOCKING_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
] as const;

/** Statuses that release a slot. */
export const NON_BLOCKING_STATUSES = ["cancelled"] as const;

/**
 * The blocking set AFTER the S1 ruling is applied across all three sites.
 * Kept here so the target is expressed once and the migration spec, the app
 * change, and the agreement test all read the same list.
 */
export const BLOCKING_STATUSES_S1_TARGET = [
  "scheduled",
  "confirmed",
  "completed",
] as const;

export const NON_BLOCKING_STATUSES_S1_TARGET = ["cancelled", "no_show"] as const;
