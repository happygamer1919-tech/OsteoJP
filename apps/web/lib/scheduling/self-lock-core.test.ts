import { describe, expect, it } from "vitest";
import {
  editPractitionerId,
  isTherapistEditLocked,
  isTherapistSelfLocked,
  shouldPreselectPrimaryService,
} from "./self-lock-core";

// PL-10 — pure decision helpers for the create-form therapist self-lock. The
// component render test (appointment-drawer.test.tsx) proves the STATIC markup
// (selector hidden, own name shown, practitioner forced to self, full active
// service list); these pin the two branch decisions that are effect/state-driven
// and therefore not observable in a react-dom/server static render.

describe("isTherapistSelfLocked (PL-10)", () => {
  it("self-locks ONLY the therapist role on create", () => {
    expect(isTherapistSelfLocked("therapist", "create")).toBe(true);
  });

  it("does NOT self-lock owner on create (JP is a clinician but role 'owner')", () => {
    expect(isTherapistSelfLocked("owner", "create")).toBe(false);
  });

  it("does NOT self-lock admin or reception on create (full dropdown kept)", () => {
    expect(isTherapistSelfLocked("admin", "create")).toBe(false);
    expect(isTherapistSelfLocked("reception", "create")).toBe(false);
  });

  it("never self-locks in edit mode, not even a therapist", () => {
    expect(isTherapistSelfLocked("therapist", "edit")).toBe(false);
    expect(isTherapistSelfLocked("reception", "edit")).toBe(false);
  });
});

describe("shouldPreselectPrimaryService (PL-10)", () => {
  it("preselects on OPEN when self-locked, with no manual therapist change", () => {
    // The DoD's "primary service preselected ON OPEN (not only after a manual
    // change)" for the self-locked therapist.
    expect(shouldPreselectPrimaryService(false, true)).toBe(true);
  });

  it("does NOT preselect on mount when NOT self-locked and untouched", () => {
    // Preserves W3-03 / PL-06a: opening the drawer (or an edit) must never
    // silently rewrite the Serviço before the user picks a therapist.
    expect(shouldPreselectPrimaryService(false, false)).toBe(false);
  });

  it("still preselects after a manual Terapeuta change (unchanged path)", () => {
    expect(shouldPreselectPrimaryService(true, false)).toBe(true);
  });
});

describe("APPT-EDIT-01: editPractitionerId, the Terapeuta an edit saves", () => {
  it("locked: the row's own, whatever the form holds", () => {
    expect(editPractitionerId({ locked: true, editingPractitionerId: "own", formPractitionerId: "colleague" })).toBe("own");
  });
  it("not locked: the form's choice", () => {
    expect(editPractitionerId({ locked: false, editingPractitionerId: "own", formPractitionerId: "colleague" })).toBe(
      "colleague",
    );
  });
});

// APPT-EDIT-02: owner ruling 2026-10-31, "A therapist may NOT change the
// therapist of a visit; reception does it." The drawer locks the Terapeuta of
// an edit for a therapist on every screen; the create form is PL-10's.
describe("APPT-EDIT-02: isTherapistEditLocked", () => {
  it("locks a therapist editing an existing visit", () => {
    expect(isTherapistEditLocked("therapist", "edit")).toBe(true);
  });

  it.each(["owner", "admin", "reception"] as const)("does not lock %s on an edit", (role) => {
    expect(isTherapistEditLocked(role, "edit")).toBe(false);
  });

  it.each(["therapist", "owner", "admin", "reception"] as const)("does not touch the create form (%s)", (role) => {
    expect(isTherapistEditLocked(role, "create")).toBe(false);
  });
});
