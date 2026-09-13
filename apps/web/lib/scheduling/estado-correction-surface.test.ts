import { describe, expect, it } from "vitest";
import { correctionTargets } from "./estado-correction";
import { hasLegalEstadoTransition, legalEstadoTransitions } from "./estado-transitions";
import type { AppointmentStatusValue } from "./types";

const ALL: AppointmentStatusValue[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

/** The row's own predicates, mirrored from appointments-list.tsx. */
const isEditable = (s: AppointmentStatusValue) => s === "scheduled" || s === "confirmed";
/** SCHED-27: the Estado control on a row, for a viewer who can cancel. */
const showsEstado = (s: AppointmentStatusValue) =>
  (isEditable(s) && hasLegalEstadoTransition(s)) || s === "cancelled";

/**
 * THE RULING'S "NEVER THROUGH THE NORMAL ESTADO CONTROL", AS A PROPERTY.
 *
 * Until SCHED-27 this asserted the two controls never appeared on the same row.
 * The owner then ruled (2026-09-13) that a Cancelada appointment returns to
 * Agendada or Confirmada through the ORDINARY control, while Concluída and Falta
 * stay on "Corrigir estado". So a Cancelada row now carries both doors, and the
 * property the ruling protects is stated directly instead: no move is offered by
 * both. It is asserted over the whole enum rather than trusted from the reading.
 */
describe("the Estado control and Corrigir estado never offer the same move", () => {
  it.each(ALL)("%s: the two doors' targets are disjoint", (status) => {
    const ordinary = showsEstado(status) ? legalEstadoTransitions(status) : [];
    const correction = correctionTargets(status);
    for (const t of correction) expect(ordinary, `${status} -> ${t} offered by both doors`).not.toContain(t);
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

  it("Cancelada is the one state with both doors, and they split its targets exactly", () => {
    expect(new Set(legalEstadoTransitions("cancelled"))).toEqual(new Set(["scheduled", "confirmed"]));
    expect(new Set(correctionTargets("cancelled"))).toEqual(new Set(["completed", "no_show"]));
  });

  it("Concluída and Falta keep only the correction door", () => {
    for (const s of ["completed", "no_show"] as const) {
      expect(showsEstado(s), s).toBe(false);
    }
  });
});
