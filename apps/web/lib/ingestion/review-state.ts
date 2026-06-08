// Human review-queue state machine for an AI-ingested clinical record, over the
// EXISTING `ai_review_state` enum (packages/db schema). This is the SECOND,
// orthogonal state machine described in CLAUDE.md rule #4 — distinct from the
// per-request `ingestion_status` machine (ingestion-status.ts) and from the
// record's own `record_status` lifecycle (draft → locked → signed).
//
// Conceptual names used by Stream D / the task brief map to the enum values:
//
//   ai_draft      → pending_review   (freshly ingested; awaiting a reviewer)
//   under_review  → in_review        (a therapist has claimed it)
//   finalized     → approved         (therapist accepted the AI payload)
//   (rejected)    → rejected         (therapist refused it)
//
// Hard architecture rule #4: AI ingestion NEVER produces a locked/signed record
// directly. A record lands as `record_status = draft` + `ai_review_state =
// pending_review`; only after a human moves it to `approved` (finalized) does it
// enter the standard record_status lifecycle. The two terminal states here
// (`approved`, `rejected`) are immutable review DECISIONS — once reached, the
// review cannot transition again. (Edits to the underlying clinical_record after
// it is locked/signed are separately blocked by the DB immutability trigger in
// migration 0001.)

export const AI_REVIEW_STATES = [
  "pending_review",
  "in_review",
  "approved",
  "rejected",
] as const;
export type AiReviewState = (typeof AI_REVIEW_STATES)[number];

/** The review state an AI-ingested record lands in at creation (rule #4). */
export const INITIAL_REVIEW_STATE: AiReviewState = "pending_review";

/** The review decision that means "therapist finalized / accepted the draft". */
export const FINALIZED_REVIEW_STATE: AiReviewState = "approved";

// Legal forward transitions for the review queue:
//   pending_review → in_review   a reviewer claims the draft
//   pending_review → rejected    a reviewer refuses it without claiming
//   in_review      → approved    the therapist finalizes (accepts the payload)
//   in_review      → rejected    the therapist refuses it
//   in_review      → pending_review  the reviewer releases it back to the queue
// `approved` and `rejected` are terminal — the review decision is immutable.
const TRANSITIONS: Record<AiReviewState, readonly AiReviewState[]> = {
  pending_review: ["in_review", "rejected"],
  in_review: ["approved", "rejected", "pending_review"],
  approved: [],
  rejected: [],
};

export function isAiReviewState(value: unknown): value is AiReviewState {
  return (
    typeof value === "string" &&
    (AI_REVIEW_STATES as readonly string[]).includes(value)
  );
}

/** True once the review decision is made and can no longer change. */
export function isTerminalReviewState(state: AiReviewState): boolean {
  return TRANSITIONS[state].length === 0;
}

export function canReviewTransition(from: AiReviewState, to: AiReviewState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws on an illegal review transition; guard a state change before writing. */
export function assertReviewTransition(from: AiReviewState, to: AiReviewState): void {
  if (!canReviewTransition(from, to)) {
    throw new Error(`ingestion review: illegal transition ${from} -> ${to}`);
  }
}

/**
 * Therapist finalizes an AI draft: the review decision moves to `approved`.
 *
 * Enforces the rule "AI submissions require human review before they are
 * finalized": `approved` is reachable ONLY from `in_review`, so a draft can
 * never jump straight from `pending_review` to finalized. Re-finalizing an
 * already-terminal review (approved/rejected) is rejected as an illegal
 * transition — the review decision is immutable once made.
 *
 * Pure: returns the next state, performs no IO. The caller persists it in the
 * same tenant-scoped write that locks the clinical_record.
 */
export function finalizeReview(from: AiReviewState): AiReviewState {
  assertReviewTransition(from, FINALIZED_REVIEW_STATE);
  return FINALIZED_REVIEW_STATE;
}
