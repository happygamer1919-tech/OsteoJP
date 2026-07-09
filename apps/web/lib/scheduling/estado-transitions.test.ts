import { describe, expect, it } from "vitest";
import { appointmentStatus, appointmentConfirmationState } from "@osteojp/db";
import {
  hasLegalEstadoTransition,
  isLegalEstadoTransition,
  legalEstadoTransitions,
} from "./estado-transitions";
import type { AppointmentStatusValue } from "./types";

const ALL = appointmentStatus.enumValues as readonly AppointmentStatusValue[];

describe("estado-transitions — lifecycle axis only", () => {
  it("never offers `cancelled` from any state (Cancel is a delete-cap action, not an Estado value)", () => {
    for (const from of ALL) {
      expect(legalEstadoTransitions(from)).not.toContain("cancelled");
      expect(isLegalEstadoTransition(from, "cancelled")).toBe(false);
    }
  });

  it("never offers a confirmation-ONLY value — the two axes stay distinct (0024/0026)", () => {
    // The estado control writes the LIFECYCLE column (patch.status). Every target
    // must be a lifecycle enum member. The confirmation axis has values that are
    // NOT lifecycle values (`pending`, `declined`); none of those may ever be an
    // estado target. (`confirmed` is a member of BOTH enums — a naming overlap —
    // but as an estado target it is unambiguously the lifecycle `confirmed`,
    // written via patch.status, never the confirmation-axis value.)
    const confirmationOnly = (appointmentConfirmationState.enumValues as readonly string[]).filter(
      (v) => !(ALL as readonly string[]).includes(v),
    );
    expect(confirmationOnly.length).toBeGreaterThan(0); // guards the assumption
    for (const from of ALL) {
      for (const target of legalEstadoTransitions(from)) {
        expect(ALL).toContain(target); // a lifecycle value
        expect(confirmationOnly).not.toContain(target as string); // never confirmation-only
      }
    }
  });

  it("only ever names known lifecycle values (no phantom targets)", () => {
    for (const from of ALL) {
      for (const target of legalEstadoTransitions(from)) {
        expect(ALL).toContain(target);
      }
    }
  });

  it("scheduled → confirmed | completed | no_show", () => {
    expect(new Set(legalEstadoTransitions("scheduled"))).toEqual(
      new Set<AppointmentStatusValue>(["confirmed", "completed", "no_show"]),
    );
  });

  it("confirmed cannot go back to scheduled; can complete or no-show", () => {
    expect(isLegalEstadoTransition("confirmed", "scheduled")).toBe(false);
    expect(isLegalEstadoTransition("confirmed", "completed")).toBe(true);
    expect(isLegalEstadoTransition("confirmed", "no_show")).toBe(true);
  });

  it("terminal states have no onward Estado transition", () => {
    for (const terminal of ["completed", "cancelled", "no_show"] as const) {
      expect(legalEstadoTransitions(terminal)).toEqual([]);
      expect(hasLegalEstadoTransition(terminal)).toBe(false);
      // An illegal jump out of a terminal state is rejected.
      expect(isLegalEstadoTransition(terminal, "scheduled")).toBe(false);
      expect(isLegalEstadoTransition(terminal, "completed")).toBe(false);
    }
  });

  it("no self-transition (changing Estado to the same value is not a transition)", () => {
    for (const from of ALL) {
      expect(isLegalEstadoTransition(from, from)).toBe(false);
    }
  });
});
