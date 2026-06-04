// The review-before-finalize boundary for patient form intake.
//
// This MIRRORS the canonical AI-ingestion boundary in
// apps/web/lib/ingestion/review-state.ts (over the shared `ai_review_state`
// enum) — which this wave reuses and does NOT change. Because the two apps don't
// share a module, the single value the intake path needs is restated here with
// the same semantics: a patient submission LANDS in `pending_review` and is
// NEVER created in a finalized state. Moving a submission forward
// (in_review → approved) is the therapist review/finalize wave's job, not this
// one — there is deliberately no finalize function here.
//
// Pure module: no DB, no framework.

import type { aiReviewState } from "@osteojp/db";

/** The ai_review_state enum value type (pending_review | in_review | …). */
export type ReviewState = (typeof aiReviewState.enumValues)[number];

/** The state a patient submission is created in. Identical to AI ingestion's
 * INITIAL_REVIEW_STATE — review starts here, finalize never happens at intake. */
export const PATIENT_SUBMISSION_INITIAL_REVIEW: ReviewState = "pending_review";

/** States that mean "finalized / decided". The intake path must NEVER produce
 * one of these — asserted by the no-auto-finalize tests. */
export const FINALIZED_REVIEW_STATES: readonly ReviewState[] = ["approved", "rejected"];

/** Guard: a submission's creation state must be the initial review state. Used
 * by the writer as a belt-and-suspenders check that intake never finalizes. */
export function assertInitialReviewState(state: ReviewState): void {
  if (state !== PATIENT_SUBMISSION_INITIAL_REVIEW) {
    throw new Error(
      `patient intake: a submission must be created in '${PATIENT_SUBMISSION_INITIAL_REVIEW}', got '${state}'`,
    );
  }
}
