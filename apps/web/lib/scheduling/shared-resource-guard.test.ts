import { describe, expect, it } from "vitest";
import {
  sharedResourceLocationAllowed,
  sharedResourcesForViewer,
  type SharedResource,
} from "./shared-resource-guard";

const CB = "cb-location";
const LV = "lv-location";
const NESA: SharedResource = { id: "nesa", label: "NESA", locationIds: [CB] };

describe("sharedResourceLocationAllowed - the SCHED-17 ruling", () => {
  it("does not touch an ordinary practitioner", () => {
    expect(
      sharedResourceLocationAllowed({ role: "therapist", actorLocationIds: [], resource: null, targetLocationId: LV }),
    ).toBe(true);
  });

  it("admits a CB therapist booking NESA at CB - the requirement", () => {
    expect(
      sharedResourceLocationAllowed({ role: "therapist", actorLocationIds: [CB], resource: NESA, targetLocationId: CB }),
    ).toBe(true);
  });

  it("refuses a CB therapist booking NESA at LV - outside the actor's locations", () => {
    expect(
      sharedResourceLocationAllowed({ role: "therapist", actorLocationIds: [CB], resource: NESA, targetLocationId: LV }),
    ).toBe(false);
  });

  it("refuses a therapist assigned to BOTH clinics booking NESA at LV - the machine is not there", () => {
    expect(
      sharedResourceLocationAllowed({ role: "therapist", actorLocationIds: [CB, LV], resource: NESA, targetLocationId: LV }),
    ).toBe(false);
  });

  it("refuses an UNASSIGNED therapist even at CB - no assigned location means no shared resource", () => {
    expect(
      sharedResourceLocationAllowed({ role: "therapist", actorLocationIds: [], resource: NESA, targetLocationId: CB }),
    ).toBe(false);
  });

  it("holds reception and admin to the same actor condition", () => {
    for (const role of ["reception", "admin"] as const) {
      expect(sharedResourceLocationAllowed({ role, actorLocationIds: [CB], resource: NESA, targetLocationId: CB })).toBe(true);
      expect(sharedResourceLocationAllowed({ role, actorLocationIds: [LV], resource: NESA, targetLocationId: LV })).toBe(false);
    }
  });

  it("exempts the owner from the actor condition and NOT from the resource condition", () => {
    expect(sharedResourceLocationAllowed({ role: "owner", actorLocationIds: [], resource: NESA, targetLocationId: CB })).toBe(true);
    expect(sharedResourceLocationAllowed({ role: "owner", actorLocationIds: [CB, LV], resource: NESA, targetLocationId: LV })).toBe(false);
  });
});

describe("sharedResourcesForViewer - what a therapist's agenda merges in", () => {
  it("includes a resource at a location the viewer shares", () => {
    expect(sharedResourcesForViewer([NESA], [CB]).map((r) => r.id)).toEqual(["nesa"]);
  });
  it("excludes it for an LV-only viewer - LV is unaffected as a property of the data", () => {
    expect(sharedResourcesForViewer([NESA], [LV])).toEqual([]);
  });
  it("excludes it for an unassigned viewer", () => {
    expect(sharedResourcesForViewer([NESA], [])).toEqual([]);
  });
});
