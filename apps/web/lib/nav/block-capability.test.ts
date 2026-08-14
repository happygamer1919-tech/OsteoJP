import { describe, expect, it } from "vitest";
import { can } from "@osteojp/auth";

/**
 * PL-27 — the agenda's "Bloquear horário" control must be gated on the SAME
 * capability the server enforces, and nothing else.
 *
 * Owner report 2026-07-31: "reception doesn't have that button I have ... in
 * agenda she can block something in the day, it's something existent but not
 * visible on their interface". The control was gated on `settings:manage`,
 * which owner and admin hold and reception does not — so it was hidden from the
 * one role whose job it is. That gate was correct at W12-28 and went STALE at
 * PL-09 Phase 5, which introduced `schedule:manage`, granted it to reception,
 * and moved every time_off write onto it. The UI check was never updated.
 *
 * These assertions are the invariant, not the symptom: whatever the matrix says
 * about who may WRITE a block is what decides who SEES the control.
 */

describe("agenda block control capability (PL-27)", () => {
  it("reception can manage schedules — the whole point of the fix", () => {
    expect(can("reception", "schedule:manage")).toBe(true);
  });

  it("reception does NOT hold settings:manage — why the old gate hid the button", () => {
    // If this ever becomes true, reception has been given tenant settings and
    // something much larger than this card needs re-reviewing.
    expect(can("reception", "settings:manage")).toBe(false);
  });

  it("every role that may write a block is a role that may see the control", () => {
    // The gate and the server assertion are the same capability, so this holds
    // by construction — it is asserted so a future regate has to break a test
    // rather than silently hide a control from someone who can use it.
    for (const role of ["owner", "admin", "reception"] as const) {
      expect(can(role, "schedule:manage")).toBe(true);
    }
  });

  it("ITEM 3: a therapist manages their OWN schedule, so the control is now SHOWN", () => {
    // This assertion was `toBe(false)` until 2026-08-14. It is inverted on the
    // owner's ruling that a therapist blocks their own schedule, not to make a
    // test pass. The control appearing is the FEATURE; the restriction is a
    // scope (`{kind:"self"}`), proven in lib/admin/therapist-self-schedule.test.ts.
    expect(can("therapist", "schedule:manage")).toBe(true);
  });

  it("every role that may write a block may see the control, therapist included", () => {
    for (const role of ["owner", "admin", "reception", "therapist"] as const) {
      expect(can(role, "schedule:manage")).toBe(true);
    }
  });
});
