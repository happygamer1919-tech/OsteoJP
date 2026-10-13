"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setPatientSurveySwitch } from "@/lib/patients/survey-switch";

/**
 * SAT-01 (S8) - staff turn a patient's satisfaction survey off, or back on,
 * from the ficha.
 *
 * The shape of care-team-actions.ts: coerce the FormData, leave every rule to
 * the lib layer (who may, on which patient, and whether the survey exists at
 * all in this deployment), turn any refusal into one opaque code the page
 * renders, then revalidate and redirect.
 *
 * THE FORM SENDS THE VALUE IT WANTS, never "the other one": a press on a stale
 * screen sets what the person saw themselves choosing, and a second press of
 * the same control changes nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page's `m` value for a switch that was not saved. Not `err...`: that prefix is the care team card's. */
const SURVEY_SWITCH_ERROR_CODE = "avaliacaoErro";

export async function setSurveySwitchAction(formData: FormData): Promise<void> {
  const patientId = String(formData.get("patientId") ?? "");
  const wanted = formData.get("enabled");
  // An id that is not an id names no page to come back to.
  if (!UUID.test(patientId)) redirect("/patients");

  let failed = wanted !== "true" && wanted !== "false";
  if (!failed) {
    try {
      await setPatientSurveySwitch(patientId, wanted === "true");
    } catch (e) {
      // The class name only (rule 7). A refusal lands here too and becomes the
      // same code as any other failure.
      console.error("patients: the survey switch was not saved", e instanceof Error ? e.name : "unknown");
      failed = true;
    }
  }
  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?tab=resumo${failed ? `&m=${SURVEY_SWITCH_ERROR_CODE}` : ""}`);
}
