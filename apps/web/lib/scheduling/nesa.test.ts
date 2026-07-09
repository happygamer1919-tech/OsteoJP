import { describe, expect, it } from "vitest";
import { matchedContraindications } from "./nesa";

describe("matchedContraindications (W2-08 NESA warning; W5-21 pacemaker)", () => {
  const none = { epilepsy: false, pregnancy: false, pacemaker: false };
  const epi = { epilepsy: true, pregnancy: false, pacemaker: false };
  const preg = { epilepsy: false, pregnancy: true, pacemaker: false };
  const pace = { epilepsy: false, pregnancy: false, pacemaker: true };
  const all = { epilepsy: true, pregnancy: true, pacemaker: true };

  it("no warning when the patient is unknown (null)", () => {
    expect(matchedContraindications(null, true)).toEqual([]);
  });

  it("no warning when the service is not contraindication-sensitive", () => {
    expect(matchedContraindications(epi, false)).toEqual([]);
    expect(matchedContraindications(pace, false)).toEqual([]);
    expect(matchedContraindications(all, false)).toEqual([]);
  });

  it("no warning when the patient has no flags (even for a sensitive service)", () => {
    expect(matchedContraindications(none, true)).toEqual([]);
  });

  it("names the single matched flag on a sensitive service", () => {
    expect(matchedContraindications(epi, true)).toEqual(["epilepsy"]);
    expect(matchedContraindications(preg, true)).toEqual(["pregnancy"]);
    expect(matchedContraindications(pace, true)).toEqual(["pacemaker"]);
  });

  it("names all flags in stable order (epilepsy, pregnancy, pacemaker) when set", () => {
    expect(matchedContraindications(all, true)).toEqual([
      "epilepsy",
      "pregnancy",
      "pacemaker",
    ]);
  });
});
