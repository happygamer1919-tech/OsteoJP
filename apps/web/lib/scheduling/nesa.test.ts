import { describe, expect, it } from "vitest";
import { matchedContraindications } from "./nesa";

describe("matchedContraindications (W2-08 NESA warning)", () => {
  const none = { epilepsy: false, pregnancy: false };
  const epi = { epilepsy: true, pregnancy: false };
  const preg = { epilepsy: false, pregnancy: true };
  const both = { epilepsy: true, pregnancy: true };

  it("no warning when the patient is unknown (null)", () => {
    expect(matchedContraindications(null, true)).toEqual([]);
  });

  it("no warning when the service is not contraindication-sensitive", () => {
    expect(matchedContraindications(epi, false)).toEqual([]);
    expect(matchedContraindications(both, false)).toEqual([]);
  });

  it("no warning when the patient has no flags (even for a sensitive service)", () => {
    expect(matchedContraindications(none, true)).toEqual([]);
  });

  it("names the single matched flag on a sensitive service", () => {
    expect(matchedContraindications(epi, true)).toEqual(["epilepsy"]);
    expect(matchedContraindications(preg, true)).toEqual(["pregnancy"]);
  });

  it("names both flags, epilepsy first, when both are set", () => {
    expect(matchedContraindications(both, true)).toEqual(["epilepsy", "pregnancy"]);
  });
});
