import "server-only";
import { can, type Role } from "@osteojp/auth";

/**
 * WHO MAY BE SHOWN A NOTE EXCERPT ON A LIST ROW. One definition, imported by
 * every surface that renders one, so a second surface cannot come to a
 * different answer. Same shape as `lib/perf/audience.ts`.
 *
 * ==========================================================================
 * IT IS `patients:read`, BECAUSE THAT IS WHAT THE FULL VIEW ASKS
 * ==========================================================================
 * `listPatientNotes`, `listAppointmentNotes` and `getAppointmentNotesAction`
 * each open with `assertCan(role, "patients:read")`. A preview gated on
 * anything else would be a SECOND answer to the same question, and the whole
 * requirement here is that the excerpt and the board are reachable by exactly
 * the same principals. It is written as a call to `can` rather than as a role
 * list for the same reason: a role list would have to be edited in step with
 * the matrix, and would not be.
 *
 * ==========================================================================
 * TODAY THIS REFUSES NOBODY, AND SAYING SO IS THE POINT
 * ==========================================================================
 * All four staff roles hold `patients:read`, so this returns true for every
 * principal that can reach either surface. A guard that cannot fire is a guard
 * that proves nothing - criterion F on `ACC-vacuous-guard-sweep` - so it is NOT
 * left to imply otherwise:
 *
 *   - `audience.test.ts` asserts the PREMISE that makes it vacuous (every role
 *     holding `followup:read` or `appointments:read` also holds
 *     `patients:read`). The day that stops being true, that test fails and
 *     names the new role, rather than a screen showing it a clinical note.
 *   - The arm that DOES fire on every request is not this one. It is the
 *     per-row patient scope in `latest-notes.ts`, where `patients_select`
 *     decides, and that arm has a DB-gated suite because it is the one a
 *     principal actually hits.
 *
 * WHY KEEP IT THEN. The two gates answer different questions and only one of
 * them is about the ROW. "May this principal be shown notes at all" is
 * answered here, once, before the read is even issued - so for a principal
 * without the capability the statement is never sent and no note text enters
 * the process. Hiding it after the fact is the difference INC-CONFIRM-10 and
 * the timing panel both record: not granting beats not drawing.
 */
export function mayReadNotePreviews(ctx: { role: Role }): boolean {
  return can(ctx.role, "patients:read");
}
