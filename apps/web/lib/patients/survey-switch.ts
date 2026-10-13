import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ForbiddenError, assertCan } from "@osteojp/auth";
import { patients } from "@osteojp/db";
import { surveyVisible } from "@/lib/reminders/survey-mode";
import { requireRequestContext, runScoped, type RequestContext } from "../auth/context";
import { writeAudit } from "./audit";
import { PatientNotFoundError } from "./errors";
import { getPatient } from "./queries";
import { offersSurveySwitch } from "./survey-switch-core";

// SAT-01 (S8) - the patient's survey switch, read and set by staff on the ficha.
//
// `patients.survey_enabled` (migration 0102): on by default; off, no survey is
// sent to this patient by any path, automatic or by staff. The patient turns it
// off on the survey page (`opt_out_survey`); staff turn it off, or back on,
// here.
//
// THE EXISTING PATIENT UPDATE PATH, NOT A DOOR. 0102 gives staff no function
// for this, on purpose: the switch is one more column of `patients`, behind the
// grant and the row policy (`patients_update`) that already decide who edits a
// patient. So this is a plain UPDATE in the caller's own session, under RLS,
// with a `patient.update` audit row that names the field, like every other
// edit of a patient. The database adds its own row, `survey.switch_changed`,
// from a trigger in the same transaction: no path changes the switch without it.
//
// ONLY THIS COLUMN IS WRITTEN. The two reminder switches are not named here.
//
// WHY THE COLUMN IS NAMED IN SQL. `schema.ts` does not declare
// `survey_enabled` (its comment on the survey tables says so), and declaring it
// there would put it into every read of a patient in both applications. This
// file reads and writes the one column by name, through the same client and
// the same transaction as any other statement.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const surveyEnabledColumn = sql<boolean>`${patients}."survey_enabled"`;

/**
 * The switch as it stands, or null when this viewer is not offered it (the
 * survey is switched off, or the role is not one that sets it) or cannot read
 * the patient. A soft-deleted patient has no switch to show.
 */
export async function readPatientSurveySwitch(
  ctx: RequestContext,
  patientId: string,
): Promise<boolean | null> {
  if (!offersSurveySwitch(ctx.role, surveyVisible())) return null;
  if (!UUID.test(patientId)) return null;
  return runScoped(ctx, async (tx) => {
    const [row] = await tx
      .select({ enabled: surveyEnabledColumn })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .limit(1);
    return row ? row.enabled === true : null;
  });
}

/**
 * Set the switch. `changed`, or `unchanged` when it already read that way (and
 * then nothing is written, not even an audit row).
 *
 * REFUSED, by throwing, in this order: no session; a role without
 * `patients:write`; the survey switched off, or a role that is not offered the
 * switch (`offersSurveySwitch`); a patient this viewer may not act on, one that
 * is soft-deleted, or one the row policy will not let them update.
 */
export async function setPatientSurveySwitch(
  patientId: string,
  enabled: boolean,
): Promise<"changed" | "unchanged"> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:write");
  if (!offersSurveySwitch(ctx.role, surveyVisible())) {
    throw new ForbiddenError(ctx.role, "patients:write");
  }
  if (!UUID.test(patientId)) throw new PatientNotFoundError();
  // The scope every other writer of a patient takes: the viewer's clinics, and
  // an active patient only.
  if (!(await getPatient(patientId))) throw new PatientNotFoundError();

  return runScoped(ctx, async (tx) => {
    const [current] = await tx
      .select({ enabled: surveyEnabledColumn })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .limit(1);
    if (!current) throw new PatientNotFoundError();
    if (current.enabled === enabled) return "unchanged";

    const updated = await tx.execute(
      sql`update ${patients} set "survey_enabled" = ${enabled}
           where ${patients.id} = ${patientId}::uuid and ${patients.deletedAt} is null
       returning ${patients.id}`,
    );
    const rows = Array.isArray(updated) ? updated : ((updated as { rows?: unknown[] }).rows ?? []);
    // No row: the row policy let this viewer read the patient and not write it.
    if (rows.length !== 1) throw new PatientNotFoundError();

    await writeAudit(tx, ctx, {
      action: "patient.update",
      entityId: patientId,
      // The field NAME only, as updatePatient writes it.
      metadata: { fields: ["surveyEnabled"] },
    });
    return "changed";
  });
}
