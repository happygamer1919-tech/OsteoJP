import { describe, expect, it } from "vitest";
import { cancelAuthority, namesSharedResource, ownCancelRefusal, type CancelTarget } from "./cancel-authority";

const ME = "therapist-me";
const OTHER = "therapist-other";
const NESA = "nesa";
const CB = "loc-cb";
const LV = "loc-lv";

const row = (p: Partial<CancelTarget>): CancelTarget => ({
  practitionerId: OTHER,
  practitionerTwoId: null,
  locationId: CB,
  ...p,
});

describe("cancelAuthority - SCHED-30, by the real permission matrix", () => {
  it.each([
    ["owner", "any"],
    ["admin", "any"],
    ["reception", "any"],
    ["therapist", "own"],
  ] as const)("%s -> %s", (role, expected) => {
    expect(cancelAuthority(role)).toBe(expected);
  });
});

describe("ownCancelRefusal - the therapist is on the row, at one of their clinics", () => {
  it.each<[string, readonly string[] | null, CancelTarget[], ReturnType<typeof ownCancelRefusal>]>([
    ["Terapeuta on the row", [CB], [row({ practitionerId: ME })], null],
    ["Terapeuta 2 on the row", [CB], [row({ practitionerTwoId: ME })], null],
    ["unassigned therapist (STAFF-02 fallback)", null, [row({ practitionerId: ME, locationId: LV })], null],
    ["not on the row", [CB], [row({})], "forbidden"],
    // 0086 lets a CB therapist see and write NESA's row; being able to see it is
    // not being on it.
    ["a NESA row they can see but are not on", [CB], [row({ practitionerId: NESA })], "forbidden"],
    ["one foreign row in a series refuses the whole call", [CB], [row({ practitionerId: ME }), row({})], "forbidden"],
    ["their row at a clinic they are not assigned to", [CB], [row({ practitionerId: ME, locationId: LV })], "location_not_assigned"],
    ["not on the row AND outside their clinics: forbidden first", [CB], [row({ locationId: LV })], "forbidden"],
  ])("%s", (_name, scope, rows, expected) => {
    expect(ownCancelRefusal(ME, scope, rows)).toBe(expected);
  });
});

describe("namesSharedResource - either slot", () => {
  const shared = new Set([NESA]);
  it.each<[string, CancelTarget[], boolean]>([
    ["NESA as Terapeuta", [row({ practitionerId: NESA })], true],
    ["NESA as Terapeuta 2", [row({ practitionerId: ME, practitionerTwoId: NESA })], true],
    ["a person as Terapeuta 2", [row({ practitionerId: ME, practitionerTwoId: OTHER })], false],
    ["no second participant", [row({ practitionerId: ME })], false],
  ])("%s", (_name, rows, expected) => {
    expect(namesSharedResource(rows, shared)).toBe(expected);
  });
});
