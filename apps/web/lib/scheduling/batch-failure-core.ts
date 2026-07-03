/**
 * Pure state helpers for the batch-failure dialog (W2-05). Kept framework-free
 * so the row transitions are unit-testable without a DOM (the web vitest runs in
 * a node environment). The dialog component owns only rendering + the async
 * rebook call; all list logic lives here.
 */
import type { BatchFailure } from "./batch-core";

export type FailureRow = {
  /** Stable React key — the ORIGINAL failed slot's UTC instant. Never changes
   *  across re-attempts, so a row keeps its identity while its failure updates. */
  key: string;
  /** Current failure info (replaced when a re-attempt still lands on a busy slot). */
  failure: BatchFailure;
  /** Editable Lisbon date/time for the re-attempt. Defaults to the failed slot. */
  date: string;
  hhmm: string;
};

/** Result of one re-attempt of a single slot through the batch engine. */
export type RebookOutcome = { booked: boolean; failure: BatchFailure | null };

export function initFailureRows(failures: BatchFailure[]): FailureRow[] {
  return failures.map((f) => ({ key: f.startsAt, failure: f, date: f.date, hhmm: f.hhmm }));
}

/** Edit a row's date/time in place (keyed by the row's stable key). */
export function editRow(
  rows: FailureRow[],
  key: string,
  patch: Partial<Pick<FailureRow, "date" | "hhmm">>,
): FailureRow[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}

/**
 * Apply a re-attempt result to the list:
 *  - booked → drop the row (that slot is now scheduled);
 *  - still busy → replace its failure (new reason / nearest alternative), keep it editable.
 */
export function applyRebook(rows: FailureRow[], key: string, outcome: RebookOutcome): FailureRow[] {
  if (outcome.booked) return rows.filter((r) => r.key !== key);
  if (!outcome.failure) return rows;
  const nf = outcome.failure;
  return rows.map((r) => (r.key === key ? { ...r, failure: nf } : r));
}
