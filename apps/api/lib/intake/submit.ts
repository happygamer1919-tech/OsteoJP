import "server-only";
import { desc } from "drizzle-orm";
import { patientFormSubmissions } from "@osteojp/db";
import { runAsPatient, type PatientPrincipal } from "@/lib/auth/patient";
import { validateFormSubmissionInput, type FormSubmissionInput } from "./catalog";
import {
  PATIENT_SUBMISSION_INITIAL_REVIEW,
  assertInitialReviewState,
  type ReviewState,
} from "./review";

// Patient form intake writer.
//
// Boundary guarantees (identical to AI ingestion, CLAUDE.md rule #4):
//   * patient_id + tenant_id come from the VERIFIED principal — NEVER the
//     payload (FormSubmissionInput has no such fields). RLS WITH CHECK
//     (migration 0011) re-enforces this on the `patient` role.
//   * source is tagged 'patient'.
//   * the row lands in `pending_review` and NEVER finalizes a clinical_record —
//     this writer touches ONLY patient_form_submissions. The therapist
//     review/finalize path is a separate future wave, not built here.

export type PatientSubmissionResult = {
  id: string;
  formKey: string;
  therapy: string | null;
  source: string;
  reviewState: ReviewState;
  submittedAt: string;
};

export type SubmitFormResult =
  | { ok: true; submission: PatientSubmissionResult }
  | { ok: false; error: string };

/**
 * Create a patient form submission. Returns a validation error result for a bad
 * shape; otherwise inserts exactly one row (source='patient',
 * review_state='pending_review') scoped to the principal and returns it.
 */
export async function createPatientFormSubmission(
  principal: PatientPrincipal,
  input: FormSubmissionInput,
): Promise<SubmitFormResult> {
  const validated = validateFormSubmissionInput(input);
  if (!validated.ok) return { ok: false, error: validated.error };

  // Belt-and-suspenders: prove at the write site that intake never finalizes.
  assertInitialReviewState(PATIENT_SUBMISSION_INITIAL_REVIEW);

  const submission = await runAsPatient(principal, async (tx) => {
    const [row] = await tx
      .insert(patientFormSubmissions)
      .values({
        // ids from the principal ONLY — never the request payload.
        tenantId: principal.tenantId,
        patientId: principal.patientId,
        formKey: validated.value.formKey,
        therapy: validated.value.therapy,
        payload: validated.value.payload,
        source: "patient",
        reviewState: PATIENT_SUBMISSION_INITIAL_REVIEW,
      })
      .returning({
        id: patientFormSubmissions.id,
        formKey: patientFormSubmissions.formKey,
        therapy: patientFormSubmissions.therapy,
        source: patientFormSubmissions.source,
        reviewState: patientFormSubmissions.reviewState,
        submittedAt: patientFormSubmissions.submittedAt,
      });
    return row;
  });

  return {
    ok: true,
    submission: {
      id: submission.id,
      formKey: submission.formKey,
      therapy: submission.therapy,
      source: submission.source,
      reviewState: submission.reviewState as ReviewState,
      submittedAt: submission.submittedAt.toISOString(),
    },
  };
}

/** List the patient's OWN submissions (RLS self-scope), newest first. */
export async function listOwnSubmissions(
  principal: PatientPrincipal,
): Promise<PatientSubmissionResult[]> {
  return runAsPatient(principal, async (tx) => {
    const rows = await tx
      .select({
        id: patientFormSubmissions.id,
        formKey: patientFormSubmissions.formKey,
        therapy: patientFormSubmissions.therapy,
        source: patientFormSubmissions.source,
        reviewState: patientFormSubmissions.reviewState,
        submittedAt: patientFormSubmissions.submittedAt,
      })
      .from(patientFormSubmissions)
      .orderBy(desc(patientFormSubmissions.submittedAt));

    return rows.map((r) => ({
      id: r.id,
      formKey: r.formKey,
      therapy: r.therapy,
      source: r.source,
      reviewState: r.reviewState as ReviewState,
      submittedAt: r.submittedAt.toISOString(),
    }));
  });
}
