// W12-13 (notes unification, R3) — pure merge/dedup for the patient profile
// Notas tab. During the transition the profile shows notes from BOTH stores:
//   - the UNIFIED `appointment_notes` (patient-level AND per-appointment rows),
//   - the legacy `patient_note_revisions` (historical patient notes),
// because the one-time backfill (owner-gated, held) has not yet copied the
// legacy history into the unified store.
//
// The backfill (SPEC-notes-unification §4.2) inserts each patient_note_revisions
// row into appointment_notes preserving `body` and `created_at` verbatim. So a
// legacy revision is de-duplicated against a unified row by its natural key
// (content + created_at): pre-backfill nothing matches (both stores show,
// nothing lost); post-backfill the copied rows match and the legacy leg is
// suppressed (nothing double-counts). This makes the read correct in BOTH states
// with no feature flag and no coordination with the backfill.
//
// Pure and store-agnostic so it unit-tests without a DB.

export type MergeableNote = {
  id: string;
  content: string;
  /** Author's full name, or null for a system/backfill row. */
  authorName: string | null;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
  /**
   * PL-13: ISO-8601 UTC of the last in-place edit, or null if never edited.
   * Legacy `patient_note_revisions` rows are always null (no edit path).
   */
  editedAt: string | null;
  /** Full name of whoever last edited, or null. */
  editedByName: string | null;
  /**
   * True only for unified `appointment_notes` rows, which alone carry the
   * editable-in-place model + UPDATE policy (migration 0050). Legacy revisions
   * render read-only.
   */
  editable: boolean;
};

/** Natural key used by the backfill: content + the exact created_at instant. */
function naturalKey(n: Pick<MergeableNote, "content" | "createdAt">): string {
  // NUL (`\0`) separator so no content/timestamp pair can collide with another.
  // Written as the `\0` escape (not a raw 0x00 byte) to keep this source UTF-8
  // text and reviewable; the runtime separator is byte-identical.
  return `${n.content}\0${new Date(n.createdAt).getTime()}`;
}

/**
 * Merge unified-store notes with legacy revisions, dropping legacy revisions
 * that a unified row already represents (backfilled), newest-first.
 *
 * @param unified appointment_notes rows for the patient (any appointment scope).
 * @param legacy  patient_note_revisions rows for the patient.
 */
export function mergePatientNotes(
  unified: MergeableNote[],
  legacy: MergeableNote[],
): MergeableNote[] {
  const unifiedKeys = new Set(unified.map(naturalKey));
  const legacyOnly = legacy.filter((r) => !unifiedKeys.has(naturalKey(r)));
  return [...unified, ...legacyOnly].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
