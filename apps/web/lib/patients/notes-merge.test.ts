import { describe, expect, it } from "vitest";
import { mergePatientNotes, type MergeableNote } from "./notes-merge";

// W12-13 (notes unification R3) — the profile Notas tab merges the unified
// appointment_notes with the legacy patient_note_revisions during the transition
// (the owner-gated backfill is held). These pin the two invariants that make the
// read correct in BOTH states: PRE-backfill nothing is lost; POST-backfill the
// copied legacy rows do not double-count.

const note = (
  id: string,
  content: string,
  createdAt: string,
  authorName: string | null = "Dr. A",
): MergeableNote => ({ id, content, createdAt, authorName });

describe("mergePatientNotes", () => {
  it("newest-first across both stores (PRE-backfill: nothing dropped)", () => {
    const unified = [note("u1", "agenda note", "2026-07-03T10:00:00.000Z")];
    const legacy = [
      note("r1", "old revision", "2026-07-01T09:00:00.000Z", null),
      note("r2", "newer revision", "2026-07-02T09:00:00.000Z"),
    ];
    const merged = mergePatientNotes(unified, legacy);
    expect(merged.map((n) => n.id)).toEqual(["u1", "r2", "r1"]);
  });

  it("de-duplicates a legacy revision that the backfill already copied (POST-backfill)", () => {
    // A backfilled row carries the SAME content + created_at as its source
    // revision (SPEC §4.2). It must appear ONCE, sourced from the unified store.
    const createdAt = "2026-07-01T09:00:00.000Z";
    const unified = [note("u-backfilled", "history one", createdAt, null)];
    const legacy = [note("r-source", "history one", createdAt, null)];
    const merged = mergePatientNotes(unified, legacy);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("u-backfilled");
  });

  it("keeps a legacy revision whose content matches but timestamp differs", () => {
    const unified = [note("u1", "same text", "2026-07-02T09:00:00.000Z")];
    const legacy = [note("r1", "same text", "2026-07-01T09:00:00.000Z")];
    const merged = mergePatientNotes(unified, legacy);
    expect(merged.map((n) => n.id)).toEqual(["u1", "r1"]);
  });

  it("returns unified-only when there are no legacy revisions", () => {
    const unified = [
      note("u2", "b", "2026-07-02T00:00:00.000Z"),
      note("u1", "a", "2026-07-01T00:00:00.000Z"),
    ];
    expect(mergePatientNotes(unified, [])).toHaveLength(2);
  });

  it("returns legacy-only when the unified store is empty (fresh, no writes yet)", () => {
    const legacy = [note("r1", "only legacy", "2026-07-01T00:00:00.000Z", null)];
    const merged = mergePatientNotes([], legacy);
    expect(merged).toEqual(legacy);
  });
});
