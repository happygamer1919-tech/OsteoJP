import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { RequestContext } from "../auth/context";

/**
 * W10-04 isolation (SPEC-isolation.md §3, owner-approved matrix 2026-07-21).
 *
 * The therapist "their patients" NARROWING predicate. A therapist may see a
 * patient ONLY if they treat or created them; owner/admin keep tenant-wide
 * cross-visibility and reception is UNCHANGED this loop (return undefined -> no
 * extra predicate). This is a data-scope layer ON TOP of the capability grid,
 * not a capability change.
 *
 * "their patients" (owner ruling Q-W10-03-2, 2026-07-21):
 *   - a patient the therapist has/had an appointment with, as PRIMARY or
 *     SECONDARY practitioner (visibility follows appointments - Q-W10-03-4), OR
 *   - a patient the therapist CREATED (`patients.created_by`), so a therapist
 *     sees a patient they registered before the first booking exists.
 *
 * The predicate runs INSIDE `runScoped` (RLS already tenant-scopes every table),
 * so the correlated subqueries are tenant-safe - tenant_id stays JWT-only,
 * nothing widened. This is SERVER-SIDE enforcement (primary); the fail-closed
 * tenant RLS stays as defense-in-depth (unchanged this migration-free loop; the
 * per-therapist RLS tightening is a migration-gated follow-up, Q-W10-04-1).
 *
 * `patientIdCol` is the patient-id column of the table being filtered
 * (`patients.id`, `clinicalRecords.patientId`, ...). Returns a Drizzle `SQL`
 * predicate to AND into the query's WHERE, or `undefined` for a non-therapist.
 */
export function therapistPatientScope(
  ctx: RequestContext,
  patientIdCol: AnyPgColumn,
): SQL | undefined {
  if (ctx.role !== "therapist") return undefined;
  const uid = ctx.userId;
  // Literal snake_case names are the stable DB column names; the aliases `po`/`ap`
  // never collide with the outer table. `${patientIdCol}` is the OUTER column.
  return sql`(
    EXISTS (
      SELECT 1 FROM patients po
      WHERE po.id = ${patientIdCol} AND po.created_by = ${uid}
    )
    OR EXISTS (
      SELECT 1 FROM appointments ap
      WHERE (ap.patient_id = ${patientIdCol} OR ap.patient_2_id = ${patientIdCol})
        AND (ap.practitioner_id = ${uid} OR ap.practitioner_2_id = ${uid})
    )
  )`;
}
