import { describe, expect, it } from "vitest";
import {
  filterRosterByViewerScope,
  filterTherapistsByLocation,
  therapistOptionsForBooking,
  type TherapistLocationAssignments,
} from "./therapist-location-filter";

// W9-02 - CB QA item 1: selecting Castelo Branco showed Linda-a-Velha
// therapists. W9-01 (f) found the cause: no location->therapist predicate
// existed at all. These tests pin the owner ruling of 2026-07-17 so a later
// loop cannot quietly reverse it.

const CB = "loc-castelo-branco";
const LV = "loc-linda-a-velha";
const EMPTY_LOC = "loc-sem-terapeutas";

const BERNARDO = { id: "u-bernardo", label: "Bernardo Calmeiro" }; // CB only
const TIAGO = { id: "u-tiago", label: "Tiago Reis" }; // LV only
const FILIPA = { id: "u-filipa", label: "Filipa Rocha" }; // LV only
const ANA = { id: "u-ana", label: "Ana Dupla" }; // CB + LV
const NOVO = { id: "u-novo", label: "Novo Terapeuta" }; // unassigned

const ROSTER = [ANA, BERNARDO, FILIPA, NOVO, TIAGO];

const ASSIGNMENTS: TherapistLocationAssignments = new Map([
  [BERNARDO.id, [CB]],
  [TIAGO.id, [LV]],
  [FILIPA.id, [LV]],
  [ANA.id, [CB, LV]],
  // NOVO is deliberately absent: a therapist with no availability rows.
]);

const idsAt = (locationId: string | null) =>
  filterTherapistsByLocation(ROSTER, ASSIGNMENTS, locationId).map((t) => t.id);

describe("filterTherapistsByLocation - CB QA item 1 (the reported bug)", () => {
  it("selecting CB yields ZERO Linda-a-Velha-only therapists", () => {
    const at = idsAt(CB);
    expect(at).not.toContain(TIAGO.id);
    expect(at).not.toContain(FILIPA.id);
  });

  it("selecting LV yields ZERO Castelo-Branco-only therapists", () => {
    expect(idsAt(LV)).not.toContain(BERNARDO.id);
  });

  it("selecting CB keeps CB-assigned therapists", () => {
    expect(idsAt(CB)).toContain(BERNARDO.id);
  });
});

describe("filterTherapistsByLocation - owner ruling 2026-07-17 (unassigned therapists)", () => {
  it("an unassigned therapist NEVER appears inside a specific location view", () => {
    expect(idsAt(CB)).not.toContain(NOVO.id);
    expect(idsAt(LV)).not.toContain(NOVO.id);
    expect(idsAt(EMPTY_LOC)).not.toContain(NOVO.id);
  });

  it("an unassigned therapist appears ONLY under Todas as localizacoes", () => {
    expect(idsAt(null)).toContain(NOVO.id);
  });

  it("an empty assignment list is equivalent to being absent from the map", () => {
    const withEmpty: TherapistLocationAssignments = new Map([[NOVO.id, []]]);
    expect(filterTherapistsByLocation([NOVO], withEmpty, CB)).toEqual([]);
    expect(filterTherapistsByLocation([NOVO], withEmpty, null)).toEqual([NOVO]);
  });

  it("accepts a thin list: CB narrows a 5-person roster to its 2 assigned therapists", () => {
    // The ruling accepts this short-term. At ruling time only 3 of 18 active
    // therapists had any availability row; owner data entry populates the rest.
    expect(idsAt(CB)).toEqual([ANA.id, BERNARDO.id]);
  });
});

describe("filterTherapistsByLocation - Todas as localizacoes restores all", () => {
  it("null locationId returns the FULL roster, assigned or not", () => {
    expect(idsAt(null)).toEqual(ROSTER.map((t) => t.id));
  });

  it("an empty-string locationId is treated as Todas, not as a location", () => {
    // The Select emits "" for Todas; navigate() maps it to null, but the filter
    // must not treat a falsy id as a real location and hide everyone.
    expect(filterTherapistsByLocation(ROSTER, ASSIGNMENTS, "")).toEqual(ROSTER);
  });

  it("does not mutate the input roster", () => {
    const before = [...ROSTER];
    filterTherapistsByLocation(ROSTER, ASSIGNMENTS, CB);
    expect(ROSTER).toEqual(before);
  });
});

describe("filterTherapistsByLocation - multi-location and composition", () => {
  it("a therapist assigned to BOTH locations appears under each", () => {
    expect(idsAt(CB)).toContain(ANA.id);
    expect(idsAt(LV)).toContain(ANA.id);
  });

  it("a location with no assigned therapists yields an empty list, never a fallback to all", () => {
    // A location with no roster must render empty rather than silently falling
    // back to every therapist - that fallback is exactly the CB bug this loop
    // fixes. The fixture id is deliberately generic: it used to name
    // Montemor-o-Novo "which is opening", and that clinic never existed.
    expect(idsAt(EMPTY_LOC)).toEqual([]);
  });

  it("preserves the caller's name ordering", () => {
    expect(idsAt(null)).toEqual([ANA.id, BERNARDO.id, FILIPA.id, NOVO.id, TIAGO.id]);
  });

  it("composes with the therapist filter: a therapist valid at CB survives the narrowing", () => {
    // The toolbar's therapist filter picks from THIS list, so composition means
    // the picked therapist must be present for the location.
    const at = filterTherapistsByLocation(ROSTER, ASSIGNMENTS, CB);
    expect(at.some((t) => t.id === BERNARDO.id)).toBe(true);
  });
});

describe("therapistOptionsForBooking - W12-23 booking dropdown scoping", () => {
  const optsAt = (locationId: string | null, keepId?: string | null) =>
    therapistOptionsForBooking(ROSTER, ASSIGNMENTS, locationId, keepId).map((t) => t.id);

  it("null location returns the full roster (no location chosen yet)", () => {
    expect(optsAt(null)).toEqual(ROSTER.map((t) => t.id));
  });

  it("a location scopes to its team (same as the toolbar predicate)", () => {
    expect(optsAt(CB)).toEqual([ANA.id, BERNARDO.id]);
  });

  it("keeps the currently-selected therapist even if they are not at the location (edit safety)", () => {
    // Editing an appointment whose therapist (TIAGO, LV-only) is not on the CB
    // team must not drop TIAGO from the Select and lose the value.
    expect(optsAt(CB, TIAGO.id)).toEqual([ANA.id, BERNARDO.id, TIAGO.id]);
  });

  it("does not duplicate the current therapist when they are already at the location", () => {
    expect(optsAt(CB, BERNARDO.id)).toEqual([ANA.id, BERNARDO.id]);
  });

  it("a location with no team yields empty (drives the empty state) unless a current therapist is kept", () => {
    expect(optsAt(EMPTY_LOC)).toEqual([]);
    expect(optsAt(EMPTY_LOC, ANA.id)).toEqual([ANA.id]);
  });

  it("keepId is ignored under Todas (full list already includes it)", () => {
    expect(optsAt(null, TIAGO.id)).toEqual(ROSTER.map((t) => t.id));
  });
});

/* ------------------------------------------------------------------ */
/* PL-14 — the VIEWER-scope narrowing (owner CR 2026-07-30). Lurdes,    */
/* admin at Linda-a-Velha, was shown all 16 staff including CB-only     */
/* therapists; the roster now follows the same location axis her data   */
/* already followed.                                                    */
/* ------------------------------------------------------------------ */
describe("filterRosterByViewerScope (PL-14)", () => {
  const lv = "loc-lv";
  const cb = "loc-cb";
  const roster = [
    { id: "t-lv" }, // Linda-a-Velha only
    { id: "t-cb" }, // Castelo Branco only
    { id: "t-both" }, // works at both
    { id: "t-none" }, // no assignment anywhere
  ];
  const assignments = new Map<string, string[]>([
    ["t-lv", [lv]],
    ["t-cb", [cb]],
    ["t-both", [lv, cb]],
  ]);

  it("an LV-scoped viewer never sees a CB-only therapist", () => {
    const visible = filterRosterByViewerScope(roster, assignments, [lv]).map((t) => t.id);
    expect(visible).toEqual(["t-lv", "t-both", "t-none"]);
  });

  it("keeps a therapist with no assignment at all (data gap, not isolation)", () => {
    expect(filterRosterByViewerScope(roster, assignments, [cb]).map((t) => t.id)).toContain(
      "t-none",
    );
  });

  it("an unrestricted viewer (owner) sees the whole roster", () => {
    expect(filterRosterByViewerScope(roster, assignments, null)).toHaveLength(4);
  });

  it("a two-clinic viewer sees both clinics' therapists", () => {
    const visible = filterRosterByViewerScope(roster, assignments, [lv, cb]).map((t) => t.id);
    expect(visible).toEqual(["t-lv", "t-cb", "t-both", "t-none"]);
  });
});
