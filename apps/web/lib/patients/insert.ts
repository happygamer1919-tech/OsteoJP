import "server-only";

import { patients } from "@osteojp/db";
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
 *
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
  await writeAudit(tx, ctx, { action: "patient.create", entityId: row.id });
  return row;
}
