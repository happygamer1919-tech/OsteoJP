// State machine for an AI ingestion request, over the EXISTING `ingestion_status`
// enum (packages/db schema 0008). The enum has exactly three values — we do not
// invent new ones here:
//
//   received  — request logged, no draft yet (column default).
//   accepted  — a draft clinical_record was created and linked; the request is
//               now in the human review queue. This is the review-queue state
//               this shell drives a successful request to.
//   rejected  — the request was refused (e.g. future per-field validation
//               failure); no draft. TODO(andrei): the rejection path is wired
//               once the field-list contract lands — see ingest.ts.
//
// NOTE: `accepted` here means "the inbound request was accepted into the system
// as a draft", NOT that the clinical content was approved. Human approval of the
// draft is a SEPARATE state machine — clinical_records.ai_review_state
// (pending_review → in_review → approved/rejected). Hard architecture rule #4:
// AI ingestion never produces a locked/signed record directly.

export const INGESTION_STATUSES = ["received", "accepted", "rejected"] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

// Legal forward transitions. `received` is the only non-terminal state; once a
// request is accepted or rejected it does not move again within ingestion (any
// further lifecycle belongs to the clinical record's review state).
const TRANSITIONS: Record<IngestionStatus, readonly IngestionStatus[]> = {
  received: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

export function isIngestionStatus(value: unknown): value is IngestionStatus {
  return (
    typeof value === "string" &&
    (INGESTION_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransition(from: IngestionStatus, to: IngestionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws on an illegal transition; use to guard a status change before writing. */
export function assertTransition(from: IngestionStatus, to: IngestionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`ingestion: illegal status transition ${from} -> ${to}`);
  }
}

/**
 * Terminal status for a freshly-received request given whether a draft was made.
 * A draft was created → `accepted` (now in the review queue); otherwise
 * `rejected`. Validated against the transition table so the mapping cannot drift
 * out of the state machine.
 */
export function resolveOutcomeStatus(draftCreated: boolean): IngestionStatus {
  const to: IngestionStatus = draftCreated ? "accepted" : "rejected";
  assertTransition("received", to);
  return to;
}
