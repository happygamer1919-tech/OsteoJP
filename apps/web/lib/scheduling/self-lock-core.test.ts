import { describe, expect, it } from "vitest";
import { isTherapistSelfLocked, shouldPreselectPrimaryService } from "./self-lock-core";

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
