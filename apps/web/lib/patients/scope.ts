import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { clinicalRecords } from "@osteojp/db";
import type { RequestContext } from "../auth/context";
import { CARE_TEAM_CLINIC_HELPER_CALL, careTeamClinicHelperPresent } from "./care-team-reads-gate";

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
 *
 * CARE-02a: this is also the WRITE scope. The patient-page readers moved to
 * `therapistPatientReadScope` below, which adds the care team; nothing that
 * writes did.
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

/**
 * CARE-02a (0098): THE READ SCOPE. `therapistPatientScope` above, OR a patient
 * whose care team the therapist is live on AT ONE OF THEIR OWN CLINICS.
 *
 * ==========================================================================
 * WHY TWO SCOPES, AND WHICH ONE IS THE DEFAULT
 * ==========================================================================
 * The owner ruled that the care team READS the ficha and the registos. He did
 * not rule that it WRITES them: 0098 widens `patients_select` and
 * `clinical_records_select` and leaves every INSERT, UPDATE and DELETE policy,
 * and `clinical_therapist_sees_patient()`, as they were. So the app keeps the
 * two apart the same way:
 *
 *   therapistPatientScope      treats or created. Every WRITE, and every picker
 *                              or work queue whose rows exist to be acted on.
 *   therapistPatientReadScope  that, OR on the care team at their clinics. The
 *                              patient-page READERS only.
 *
 * The narrow scope keeps its old name on purpose: every caller that exists
 * today stays exactly as narrow as it was unless it is moved here by hand, and
 * the register in scope-callers.test.ts is where each move is decided and
 * pinned. A new caller that picks the wrong one shows a care-team therapist
 * LESS, never lets them act on more.
 *
 * ==========================================================================
 * THE CARE-TEAM ARM IS 0098's CLINIC-LIMITED HELPER, THE SAME ONE RLS USES
 * ==========================================================================
 * The owner's ruling of 2026-09-27 ("limit to their clinic only"): a care-team
 * therapist reads a patient only when the patient is linked to one of the
 * therapist's own clinics, on 0045's location basis. 0098 v2 states that rule
 * ONCE, in the nullary SECURITY DEFINER helper named in care-team-reads-gate.ts
 * (CARE_TEAM_CLINIC_HELPER), and joins it into `patients_select`,
 * `clinical_records_select` and `patient_care_team_select`. This arm calls the
 * same helper, so the app never shows what RLS refuses, and the rule is not
 * restated here where it could drift. `(SELECT ...)` is one initplan per
 * statement, the shape 0091 gives its helper.
 *
 * It MATTERS MOST WHERE RLS DOES NOT BACK IT. `attachments` and
 * `clinical_episodes` keep their tenant-only policies (their narrowing is the
 * N5 wave, not 0098), so on those two tables this predicate is the whole of
 * the narrowing, the clinic limit included. 0091's unlimited
 * `viewer_care_team_patient_ids()` here would show a therapist the Documentos
 * of a care-team patient at another clinic whose ficha RLS refuses them.
 *
 * ==========================================================================
 * ASYNC, BECAUSE IT ASKS WHETHER THE HELPER EXISTS FIRST
 * ==========================================================================
 * Until 0098 is applied the helper does not exist, and naming it raises 42883
 * and kills the whole read (care-team-reads-gate.ts has the measurement's
 * precedent). So this asks the schema first, once per process when present,
 * and without the helper returns the narrow scope: what the app read before
 * CARE-02a and what RLS admits before 0098. Only a therapist asks; every other
 * role returns `undefined` before any read.
 */
export async function therapistPatientReadScope(
  ctx: RequestContext,
  patientIdCol: AnyPgColumn,
): Promise<SQL | undefined> {
  const own = therapistPatientScope(ctx, patientIdCol);
  if (!own) return undefined;
  if (!(await careTeamClinicHelperPresent(ctx))) return own;
  return sql`(
    ${own}
    OR ${patientIdCol} = ANY (coalesce((SELECT ${sql.raw(CARE_TEAM_CLINIC_HELPER_CALL)}), '{}'::uuid[]))
  )`;
}

/**
 * CARE-02a (0098): THE REGISTOS A THERAPIST MAY WRITE FROM. The ones they
 * authored, or of a patient they treat or created: `clinical_records_select`'s
 * therapist arm EXACTLY AS IT STOOD BEFORE 0098 (0045:221-240, where
 * clinical_therapist_sees_patient() is the treats-or-created test
 * `therapistPatientScope` states).
 *
 * WHY IT EXISTS. Several registo writers gate on nothing but "the source row is
 * SELECT-visible" and then write somewhere whose policy would admit them anyway:
 * a new version (clinical_records_insert admits any therapist filing in their
 * own name), an annulment (record_annulments is tenant-only), an attachment on
 * a draft (attachments is tenant-only). 0098 widens the SELECT to the care
 * team, so without this each of those writes would widen with it. ANDed into
 * the source read, it keeps every one of them at its pre-0098 reach, and for a
 * write whose own policy already refuses (an UPDATE or DELETE of the registo)
 * it turns a silent 0-row write and its audit row into a clean `not_found`.
 *
 * `undefined` for every non-therapist, so owner and admin are unchanged.
 */
export function therapistRegistoWriteScope(ctx: RequestContext): SQL | undefined {
  const own = therapistPatientScope(ctx, clinicalRecords.patientId);
  if (!own) return undefined;
  return sql`(${clinicalRecords.practitionerId} = ${ctx.userId} OR ${own})`;
}

/** Which of the two therapist scopes a caller asks for. */
export type PatientAccess = "read" | "write";

/**
 * The scope for `access`. "write" is `therapistPatientScope`, "read" is
 * `therapistPatientReadScope`. For callers that take the choice as an option
 * (getPatient); everyone else calls the one they mean by name.
 */
export async function therapistPatientScopeFor(
  ctx: RequestContext,
  patientIdCol: AnyPgColumn,
  access: PatientAccess,
): Promise<SQL | undefined> {
  return access === "read"
    ? therapistPatientReadScope(ctx, patientIdCol)
    : therapistPatientScope(ctx, patientIdCol);
}

/**
 * PL-09 Phase 1: reception + admin see only patients AT their location(s). A
 * patient belongs to a location by the SAME basis the 0045 clinical admin rule
 * uses: they have an appointment there (as primary OR secondary), OR — only via
 * the persisted fallback — `patients.primary_location_id` is one of those
 * locations. Runs INSIDE runScoped, so the correlated subqueries stay tenant-safe.
 *
 * Pure: takes the already-resolved location ids (from viewerLocationScope).
 * Returns a Drizzle SQL predicate to AND into the query's WHERE. Callers pass this
 * only for reception/admin WITH an assignment; owner sees all, therapist uses
 * therapistPatientScope. `locationIds` must be non-empty.
 */
export function patientLocationScope(
  patientIdCol: AnyPgColumn,
  locationIds: readonly string[],
): SQL {
  const locs = sql.join(
    locationIds.map((id) => sql`${id}`),
    sql`, `,
  );
  return sql`(
    EXISTS (
      SELECT 1 FROM appointments ap
      WHERE (ap.patient_id = ${patientIdCol} OR ap.patient_2_id = ${patientIdCol})
        AND ap.location_id IN (${locs})
    )
    OR EXISTS (
      SELECT 1 FROM patients pl
      WHERE pl.id = ${patientIdCol} AND pl.primary_location_id IN (${locs})
    )
  )`;
}
