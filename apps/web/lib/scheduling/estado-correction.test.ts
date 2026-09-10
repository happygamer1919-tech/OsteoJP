import { describe, expect, it } from "vitest";
import {
  correctionTargets,
  FINAL_STATES,
  isFinalStatus,
  isLegalEstadoCorrection,
} from "./estado-correction";
import { legalEstadoTransitions } from "./estado-transitions";

describe("estado correction — the second door, and only for final states", () => {
  it("the clinic's exact case is now legal AS A CORRECTION", () => {
    expect(isLegalEstadoCorrection("cancelled", "completed")).toBe(true);
  });

  it("every final state can be corrected to the other two, never to itself", () => {
    expect(correctionTargets("cancelled")).toEqual(["completed", "no_show"]);
    expect(correctionTargets("completed")).toEqual(["cancelled", "no_show"]);
    expect(correctionTargets("no_show")).toEqual(["completed", "cancelled"]);
  });

  it("a no-op is REFUSED — an audit row claiming an unmade change is worse than none", () => {
    for (const s of FINAL_STATES) expect(isLegalEstadoCorrection(s, s)).toBe(false);
  });

  it("pending and confirmada get no correction door at all", () => {
    for (const s of ["scheduled", "confirmed"] as const) {
      expect(isFinalStatus(s)).toBe(false);
      expect(correctionTargets(s)).toEqual([]);
      expect(isLegalEstadoCorrection(s, "completed")).toBe(false);
      expect(isLegalEstadoCorrection("completed", s)).toBe(false);
    }
  });

  it("THE ORDINARY ESTADO MAP IS UNCHANGED — this is a separate door, not a wider one", () => {
    // The whole point of the ruling: a correction must never be reachable
    // through the control that records real lifecycle events.
    for (const s of FINAL_STATES) expect(legalEstadoTransitions(s)).toEqual([]);
  });
});
