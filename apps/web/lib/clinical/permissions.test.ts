import { describe, it, expect } from "vitest";
import { can } from "@osteojp/auth";

/**
 * BUG-06 regression guard.
 *
 * The /clinical "Nova Ficha" button is gated on `clinical_records:author`
 * (see app/clinical/page.tsx) because /clinical/new redirects any non-author
 * back to /clinical — showing the button to a read-only role produced a dead
 * click. These lock the capability matrix the gate (and the create flow) rely
 * on: authors can create, admins are read-only, reception has no clinical
 * access at all.
 */
describe("clinical authoring permission (Nova Ficha gate)", () => {
  it("owner and therapist may author records", () => {
    expect(can("owner", "clinical_records:author")).toBe(true);
    expect(can("therapist", "clinical_records:author")).toBe(true);
  });

  it("admin may read but not author (oversight role, not clinician)", () => {
    expect(can("admin", "clinical_records:read")).toBe(true);
    expect(can("admin", "clinical_records:author")).toBe(false);
  });

  it("reception has no clinical access at all", () => {
    expect(can("reception", "clinical_records:read")).toBe(false);
    expect(can("reception", "clinical_records:author")).toBe(false);
  });
});
