import "server-only";

import { patientLocations, patients } from "@osteojp/db";
import type { DbTx } from "@osteojp/db";

import type { RequestContext } from "../auth/context";
import { writeAudit } from "./audit";

/**
 * GUEST-06 — the ONE place a `patients` row is inserted.
 *
 * WHY THIS EXISTS RATHER THAN A SECOND INSERT. Converting a guest request
 * creates a patient, and it must do so in the SAME transaction that marks the
 * request handled — otherwise a crash between the two leaves a patient row with
 * a request still sitting in the queue, and the next receptionist converts it
 * again. `createPatient` / `createStubPatient` live in a `"use server"` module,
 * where every export is a browser-callable action and nothing can accept a `tx`.
 * So the transactional half moved here, where it is an ordinary function, and
 * both callers share it.
 *
 * THE FIELD LIST IS NOT WHAT IS SHARED. The four invariants below are:
 *
 *   1. `tenant_id` is set EXPLICITLY (CLAUDE.md rule 3). It is NOT NULL, and RLS
 *      WITH CHECK then verifies it equals the caller's tenant.
 *   2. `patient_number` is OMITTED, never computed. The 0029 BEFORE INSERT
 *      trigger (SECURITY DEFINER since 0047) assigns it under an advisory lock
 *      and sees the true tenant max regardless of the caller's RLS view. A value
 *      computed here would be too low for any location-scoped viewer (PL-09) and
 *      would collide with an invisible patient's number.
 *   3. The audit row is written with the SAME `tx` (hard rule 6).
 *   4. An insert that returns no row THROWS. It cannot return a null patient for
 *      a caller to skip over: PORTAL-REHYDRATE §1.3, an unhandled case on a path
 *      that produces a record must fail rather than degrade into a benign-looking
 *      value.
 *   5. The `patient_locations` link for `primary_location_id` is written HERE,
 *      in the same transaction. See below — this is PL-34.
 *
 * PL-34 — THE LINK ROW, AND WHY IT LIVES IN THE INSERT RATHER THAN AT THE THREE
 * CALL SITES.
 *
 * `patient_locations` had exactly ONE writer in this repo and it was the
 * Fisiozero importer (`packages/db/src/migration/upsert.ts`). Every patient the
 * APPLICATION created — the staff form, the guest convert, the walk-in stub —
 * landed with `primary_location_id` set and no row in the junction table at all.
 * The 2026-09-07 Castelo Branco reconciliation counted 26 such patients and the
 * number grew with every registration, because the defect was in the create path
 * rather than in the import.
 *
 * IT IS NOT A VISIBILITY DEFECT TODAY AND THE FIX IS NOT SOLD AS ONE. Nothing
 * reads `patient_locations`: PL-09 scopes a patient to a clinic through
 * `appointments.location_id` OR `patients.primary_location_id`
 * (`lib/patients/scope.ts`, and 0047's policy does the same in SQL). So the 26
 * are not hidden. What they are is a junction table that disagrees with the
 * column beside it, in a schema where the importer, `merge_patients` (0005) and
 * `deletePatientHard` all maintain the link and only the create path does not —
 * so the first read of it silently loses every application-created patient.
 *
 * ONE PLACE, FOR THE REASON THE REST OF THIS FILE EXISTS. Writing it at the call
 * sites would have been three edits and a fourth caller away from the same bug.
 * `onConflictDoNothing` matches the importer's own shape: the unique key is
 * (tenant, patient, location) and re-asserting a link is not an error.
 * Validation stays with the callers. `createPatientImpl` parses through
 * `parseCreatePatient`; the guest convert has no free-text input to parse — its
 * name and phone come from a row the public form already validated at write
 * time, and every id it passes was read back out of the database under RLS.
 */

/** Everything a caller may set. The four invariants above are NOT in here,
 *  which is the point: a caller cannot express them wrongly because it cannot
 *  express them at all. */
export type PatientInsertFields = Omit<
  typeof patients.$inferInsert,
  "id" | "tenantId" | "createdBy" | "patientNumber"
>;

export async function insertPatientTx(
  tx: DbTx,
  ctx: RequestContext,
  fields: PatientInsertFields,
): Promise<typeof patients.$inferSelect> {
  const [row] = await tx
    .insert(patients)
    .values({
      tenantId: ctx.tenantId,
      createdBy: ctx.userId,
      ...fields,
    })
    .returning();
  if (!row) throw new Error("Patient insert returned no row");
  // PL-34 — invariant 5. Conditional on the column, not on the caller: a patient
  // with no primary location has no link to write, and that is the one state
  // this cannot invent a value for.
  if (row.primaryLocationId) {
    await tx
      .insert(patientLocations)
      .values({
        tenantId: ctx.tenantId,
        patientId: row.id,
        locationId: row.primaryLocationId,
      })
      .onConflictDoNothing();
  }
  await writeAudit(tx, ctx, { action: "patient.create", entityId: row.id });
  return row;
}
