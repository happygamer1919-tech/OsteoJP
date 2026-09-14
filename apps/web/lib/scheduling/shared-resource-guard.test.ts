import { describe, expect, it } from "vitest";
import {
  sharedResourceLocationAllowed,
  sharedResourcesForViewer,
  withSharedResourceOptions,
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

describe("withSharedResourceOptions - SCHED-29.4, what owner, admin and reception are offered", () => {
  const PEOPLE = [
    { id: "ana", label: "Ana" },
    { id: "bruno", label: "Bruno" },
  ];

  it("offers NESA after the people at the clinic where it is installed", () => {
    expect(withSharedResourceOptions(PEOPLE, [NESA], CB)).toEqual([...PEOPLE, { id: "nesa", label: "NESA" }]);
  });

  it("does not offer it at a clinic without the machine", () => {
    expect(withSharedResourceOptions(PEOPLE, [NESA], LV)).toEqual(PEOPLE);
  });

  it("offers every resource when no clinic is chosen (Todas as localizações)", () => {
    const other: SharedResource = { id: "nesa-lv", label: "NESA LV", locationIds: [LV] };
    expect(withSharedResourceOptions(PEOPLE, [NESA, other], null).map((o) => o.id)).toEqual([
      "ana",
      "bruno",
      "nesa",
      "nesa-lv",
    ]);
  });

  it("does not list a machine twice when the people roster already carries it (flagged bookable too)", () => {
    const roster = [...PEOPLE, { id: "nesa", label: "NESA" }];
    expect(withSharedResourceOptions(roster, [NESA], CB)).toEqual(roster);
  });

  it("is keyed on the resource list alone: no resource, no extra option, whatever is_bookable says", () => {
    expect(withSharedResourceOptions(PEOPLE, [], CB)).toEqual(PEOPLE);
  });

  it("carries only id and label, never the location list, into an option", () => {
    expect(withSharedResourceOptions([], [NESA], CB)).toEqual([{ id: "nesa", label: "NESA" }]);
  });
});
