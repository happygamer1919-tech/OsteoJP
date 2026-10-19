import { describe, expect, it } from "vitest";

import { moveConfirmation } from "./move-confirmation";

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

describe("moveConfirmation", () => {
  it.each([
    ["a new start, same therapist", { startsAt: NINE, practitionerId: ANA }, { startsAt: TEN, practitionerId: ANA }, undefined],
    ["a new start AND a new therapist", { startsAt: NINE, practitionerId: ANA }, { startsAt: TEN, practitionerId: RUI }, undefined],
    ["the same start, a new therapist", { startsAt: NINE, practitionerId: ANA }, { startsAt: NINE, practitionerId: RUI }, "therapist_only"],
    ["the same start, the same therapist", { startsAt: NINE, practitionerId: ANA }, { startsAt: NINE, practitionerId: ANA }, "none"],
  ] as const)("%s", (_name, before, after, owed) => {
    expect(moveConfirmation(before, after)).toBe(owed);
  });

  it("compares the INSTANT, not the Date object: an equal start read twice is the same start", () => {
    expect(
      moveConfirmation(
        { startsAt: new Date(NINE.getTime()), practitionerId: ANA },
        { startsAt: new Date(NINE.toISOString()), practitionerId: ANA },
      ),
    ).toBe("none");
  });

  it("a start one millisecond away is a change of start", () => {
    expect(
      moveConfirmation(
        { startsAt: NINE, practitionerId: ANA },
        { startsAt: new Date(NINE.getTime() + 1), practitionerId: RUI },
      ),
    ).toBeUndefined();
  });

  it("no row before the save keeps today's confirmation: a gap costs a repeat, never a lost message", () => {
    expect(moveConfirmation(undefined, { startsAt: NINE, practitionerId: ANA })).toBeUndefined();
  });
});
