import "server-only";
import { assertCan } from "@osteojp/auth";
import {
  listGuestIntakesForPatient as readIntakesForPatient,
  listGuestIntakesForRequests as readIntakesForRequests,
  type GuestIntakeRecord,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";

/**
 * INTAKE-01 (staff side) - the two staff reads of a guest clinical intake, as
 * the pages call them. THIN ON PURPOSE: the SQL lives in packages/db
 * (`src/guest-intake-reads.ts`, CLAUDE.md "no raw SQL in app code"), and a guard
 * in this directory asserts no statement is written here.
 *
 * What this layer adds is the two things that belong to the app:
 *   1. the capability gate, `guest_intake:read` (every staff role), which
 *      throws rather than returning empty, so a caller cannot mistake a refusal
 *      for "no answers"; and
 *   2. `runScoped`: the read runs as `authenticated` under the viewer's own
 *      claims, so migration 0087's policy decides the rows. A therapist sees
 *      nothing before conversion and, after it, only a patient they see
 *      clinically; admin and reception are location-scoped.
 *
 * INERT UNTIL 0087 IS APPLIED: the package reads check the table first, and
 * answer `null` (queue) or `[]` (ficha) while it is absent.
 */

/** Keyed by request id; `null` while the feature is off (0087 not applied). */
export async function listGuestIntakesForRequests(
  ctx: RequestContext,
  requestIds: readonly string[],
): Promise<Map<string, GuestIntakeRecord> | null> {
  assertCan(ctx.role, "guest_intake:read");
  return runScoped(ctx, (tx) => readIntakesForRequests(tx, requestIds), "guest-intake:by-request");
}

/** Every intake converted to this patient, newest first; `[]` while the feature is off. */
export async function listGuestIntakesForPatient(
  ctx: RequestContext,
  patientId: string,
): Promise<GuestIntakeRecord[]> {
  assertCan(ctx.role, "guest_intake:read");
  return runScoped(ctx, (tx) => readIntakesForPatient(tx, patientId), "guest-intake:by-patient");
}
