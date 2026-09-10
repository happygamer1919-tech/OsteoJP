import { describe, expect, it } from "vitest";
import { correctionTargets } from "./estado-correction";
import { hasLegalEstadoTransition } from "./estado-transitions";
import type { AppointmentStatusValue } from "./types";

const ALL: AppointmentStatusValue[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

/** The row's own predicate, mirrored from appointments-list.tsx. */
const isEditable = (s: AppointmentStatusValue) => s === "scheduled" || s === "confirmed";

/**
 * THE RULING'S "NEVER THROUGH THE NORMAL ESTADO CONTROL", AS A PROPERTY.
 *
 * The two controls must never both appear on one row. In the component that
 * holds because `EstadoInline` needs `isEditable` and `CorrigirEstadoInline`
 * needs a final state, and nothing is both — but "nothing is both" is exactly
 * the kind of fact that stops being true when somebody adds a status. This
 * asserts it over the whole enum instead of trusting the reading.
 */
describe("the Estado control and Corrigir estado are mutually exclusive, per status", () => {
  it.each(ALL)("%s offers exactly one of the two doors (or neither)", (status) => {
    const estado = isEditable(status) && hasLegalEstadoTransition(status);
    const correct = correctionTargets(status).length > 0;
    expect(estado && correct, `${status} offers BOTH doors`).toBe(false);
  });

  it("every final state offers the correction door", () => {
    for (const s of ["completed", "cancelled", "no_show"] as const) {
      expect(correctionTargets(s).length, s).toBeGreaterThan(0);
    }
  });

  it("every non-final state offers the ordinary door and NOT the correction one", () => {
    for (const s of ["scheduled", "confirmed"] as const) {
      expect(hasLegalEstadoTransition(s), s).toBe(true);
      expect(correctionTargets(s), s).toEqual([]);
    }
  });
});
