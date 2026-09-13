import { describe, expect, it } from "vitest";
import { correctionEntersBlockingSet, isLegalEstadoCorrection } from "./estado-correction";
import type { AppointmentStatusValue } from "./types";

/**
 * SCHED-28 — which corrections re-check the slot.
 *
 * Every LEGAL correction is enumerated, not sampled: there are six, and the rule
 * is that exactly the two INTO `completed` from a slot-releasing state run the
 * check. A seventh correction added later lands in the "every legal pair" loop
 * and has to be classified on purpose.
 */
const ALL: AppointmentStatusValue[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

describe("correctionEntersBlockingSet", () => {
  it("is true for cancelled -> completed and no_show -> completed", () => {
    expect(correctionEntersBlockingSet("cancelled", "completed")).toBe(true);
    expect(correctionEntersBlockingSet("no_show", "completed")).toBe(true);
  });

  it("is false for every other LEGAL correction", () => {
    const legal = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(([f, t]) =>
      isLegalEstadoCorrection(f, t),
    );
    expect(legal).toHaveLength(6);
    const checked = legal.filter(([f, t]) => correctionEntersBlockingSet(f, t));
    expect(checked).toEqual([
      ["cancelled", "completed"],
      ["no_show", "completed"],
    ]);
  });
});
