import { describe, expect, it } from "vitest";

import { moveConfirmation, type MoveSide } from "./move-confirmation";

/**
 * Q-K: what a MOVE owes the patient's confirmation, as a table. The action
 * that calls it (rescheduleAppointment) is driven end to end in
 * lib/reminders/confirmation-resend-rule.test.ts, and against Postgres in
 * ./move-confirmation.db.test.ts.
 *
 * Ids are invented.
 */

const NINE = new Date("2031-05-14T09:00:00.000Z");
const TEN = new Date("2031-05-14T10:00:00.000Z");
const ANA = "therapist-ana";
const RUI = "therapist-rui";
const CB = "loc-castelo-branco";
const LV = "loc-linda-a-velha";

const before: MoveSide = { startsAt: NINE, practitionerId: ANA, locationId: CB };
const after = (change: Partial<MoveSide>): MoveSide => ({ ...before, ...change });

describe("moveConfirmation", () => {
  it.each([
    ["a new start", { startsAt: TEN }, undefined],
    ["a new start AND a new therapist", { startsAt: TEN, practitionerId: RUI }, undefined],
    ["a new start AND a new clinic", { startsAt: TEN, locationId: LV }, undefined],
    ["a new clinic only: the message names the clinic, so the full confirmation", { locationId: LV }, undefined],
    ["a new clinic AND a new therapist: full too", { locationId: LV, practitionerId: RUI }, undefined],
    ["a new therapist only", { practitionerId: RUI }, "therapist_only"],
    ["nothing it reads changed (a duration-only save, or an identical one)", {}, "none"],
  ] as const)("%s", (_name, change, owed) => {
    expect(moveConfirmation(before, after(change))).toBe(owed);
  });

  it("compares the INSTANT, not the Date object: an equal start read twice is the same start", () => {
    expect(
      moveConfirmation(
        { ...before, startsAt: new Date(NINE.getTime()) },
        after({ startsAt: new Date(NINE.toISOString()) }),
      ),
    ).toBe("none");
  });

  it("a start one millisecond away is a change of start", () => {
    expect(moveConfirmation(before, after({ startsAt: new Date(NINE.getTime() + 1), practitionerId: RUI }))).toBeUndefined();
  });

  it("no row before the save keeps today's confirmation: a gap costs a repeat, never a lost message", () => {
    expect(moveConfirmation(undefined, before)).toBeUndefined();
  });
});
