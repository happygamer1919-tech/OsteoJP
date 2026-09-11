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
): MergeableNote => ({
  id,
  content,
  createdAt,
  authorName,
  editedAt: null,
  editedByName: null,
  editable: true,
  appointment: null,
});

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

// NOTES-03 - the ruling (2026-09-11): a note on a marcação orders by the MARCAÇÃO's
// date, newest first; a patient-level note interleaves by its creation date; the
// last-edited time orders nothing.
describe("mergePatientNotes orders by the marcação date (NOTES-03)", () => {
  const onVisit = (
    id: string,
    createdAt: string,
    startsAt: string,
    editedAt: string | null = null,
  ): MergeableNote => ({
    ...note(id, `note ${id}`, createdAt),
    editedAt,
    editedByName: editedAt ? "Dr. B" : null,
    appointment: { id: `appt-${id}`, startsAt, practitionerName: "Dr. A" },
  });

  it("a note added TODAY to an old marcação stays under that marcação's date", () => {
    // The shape the clinic reported as 'an edited old note jumps to the top': the
    // March visit got a second note in September.
    const merged = mergePatientNotes(
      [
        onVisit("june", "2026-06-10T10:00:00.000Z", "2026-06-10T09:00:00.000Z"),
        onVisit("march-late", "2026-09-11T08:00:00.000Z", "2026-03-02T09:00:00.000Z"),
        onVisit("march", "2026-03-02T10:00:00.000Z", "2026-03-02T09:00:00.000Z"),
      ],
      [],
    );
    expect(merged.map((n) => n.id)).toEqual(["june", "march-late", "march"]);
  });

  it("a note written days BEFORE its visit sorts at the visit's date, not at when it was typed", () => {
    const merged = mergePatientNotes(
      [
        onVisit("typed-at-booking", "2026-05-01T10:00:00.000Z", "2026-06-20T09:00:00.000Z"),
        onVisit("may-visit", "2026-05-15T10:00:00.000Z", "2026-05-15T09:00:00.000Z"),
      ],
      [],
    );
    expect(merged.map((n) => n.id)).toEqual(["typed-at-booking", "may-visit"]);
  });

  it("an in-place edit never reorders: edited_at is metadata only", () => {
    const merged = mergePatientNotes(
      [
        onVisit("june", "2026-06-10T10:00:00.000Z", "2026-06-10T09:00:00.000Z"),
        onVisit("march-edited", "2026-03-02T10:00:00.000Z", "2026-03-02T09:00:00.000Z", "2026-09-11T08:00:00.000Z"),
      ],
      [],
    );
    expect(merged.map((n) => n.id)).toEqual(["june", "march-edited"]);
    expect(merged[1].editedAt).toBe("2026-09-11T08:00:00.000Z");
  });

  it("patient-level notes (unified and legacy) interleave by their creation date", () => {
    const merged = mergePatientNotes(
      [
        onVisit("june", "2026-06-10T10:00:00.000Z", "2026-06-10T09:00:00.000Z"),
        note("person-april", "about the person", "2026-04-01T10:00:00.000Z"),
        onVisit("march-late", "2026-09-11T08:00:00.000Z", "2026-03-02T09:00:00.000Z"),
      ],
      [note("legacy-july", "legacy", "2026-07-01T10:00:00.000Z", null)],
    );
    expect(merged.map((n) => n.id)).toEqual(["legacy-july", "june", "person-april", "march-late"]);
  });

  it("two notes on the same marcação: the later-written one first", () => {
    const merged = mergePatientNotes(
      [
        onVisit("first", "2026-03-02T10:00:00.000Z", "2026-03-02T09:00:00.000Z"),
        onVisit("second", "2026-03-02T11:00:00.000Z", "2026-03-02T09:00:00.000Z"),
      ],
      [],
    );
    expect(merged.map((n) => n.id)).toEqual(["second", "first"]);
  });
});
