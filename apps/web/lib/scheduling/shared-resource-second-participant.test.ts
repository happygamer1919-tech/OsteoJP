import { describe, expect, it } from "vitest";
import {
  secondParticipantOptionsForTherapist,
  therapistSecondParticipantVerdict,
  type SharedResource,
} from "./shared-resource-guard";

/**
 * SCHED-29 - a therapist's "Terapeuta 2" is NESA at a clinic where it is
 * installed, and nothing else. Every refusal is a row here, not a sentence.
 */
const CB = "loc-cb";
const LV = "loc-lv";
const NESA: SharedResource = { id: "nesa", label: "NESA", locationIds: [CB] };
const SELF = "therapist-self";
const COLLEAGUE = "therapist-colleague";

describe("secondParticipantOptionsForTherapist", () => {
  it("offers NESA at CB", () => {
    expect(secondParticipantOptionsForTherapist([NESA], CB, SELF).map((r) => r.id)).toEqual(["nesa"]);
  });

  it("offers nothing at LV, where NESA is not installed", () => {
    expect(secondParticipantOptionsForTherapist([NESA], LV, SELF)).toEqual([]);
  });

  it("offers nothing before a clinic is chosen", () => {
    expect(secondParticipantOptionsForTherapist([NESA], null, SELF)).toEqual([]);
  });

  it("never offers the primary as its own second participant", () => {
    expect(secondParticipantOptionsForTherapist([NESA], CB, "nesa")).toEqual([]);
  });
});

describe("therapistSecondParticipantVerdict", () => {
  const base = {
    primaryId: SELF,
    targetLocationId: CB,
    actorLocationIds: [CB],
    resources: [NESA],
  };

  it("no second participant is always fine", () => {
    expect(therapistSecondParticipantVerdict({ ...base, practitionerTwoId: null })).toBe("ok");
  });

  it("NESA at CB, for a CB therapist, is allowed", () => {
    expect(therapistSecondParticipantVerdict({ ...base, practitionerTwoId: "nesa" })).toBe("ok");
  });

  it("a PERSON is refused, even a real colleague in the same clinic", () => {
    expect(therapistSecondParticipantVerdict({ ...base, practitionerTwoId: COLLEAGUE })).toBe("not_a_resource");
  });

  it("NESA at LV is refused as a location problem", () => {
    expect(
      therapistSecondParticipantVerdict({
        ...base,
        practitionerTwoId: "nesa",
        targetLocationId: LV,
        actorLocationIds: [CB, LV],
      }),
    ).toBe("resource_location");
  });

  it("NESA at CB is refused for a therapist who does not work at CB", () => {
    expect(
      therapistSecondParticipantVerdict({ ...base, practitionerTwoId: "nesa", actorLocationIds: [LV] }),
    ).toBe("resource_location");
  });

  it("the primary named twice is refused", () => {
    expect(
      therapistSecondParticipantVerdict({ ...base, primaryId: "nesa", practitionerTwoId: "nesa" }),
    ).toBe("not_a_resource");
  });
});
