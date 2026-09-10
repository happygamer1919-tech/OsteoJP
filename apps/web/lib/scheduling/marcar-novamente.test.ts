import { describe, expect, it } from "vitest";
import { isEligibleForScheduleAgain, isPastConsuming } from "./schedule-again-core";
import type { AppointmentStatusValue } from "./types";

const ALL: AppointmentStatusValue[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

/**
 * B6 half 2 — MARCAR NOVAMENTE ON EVERY APPOINTMENT.
 *
 * WHAT WAS REPRODUCED BEFORE THE CHANGE, and what this file now holds the
 * inverse of:
 *
 *   PROFILE hid every FUTURE appointment not already completed:
 *     isEligibleForScheduleAgain({status:"scheduled", startsAt: FUTURE}) -> false
 *     ...and the same for confirmed, cancelled, no_show.
 *   DRAWER hid those AND every PAST CANCELLED one:
 *     isPastConsuming({status:"cancelled", startsAt: PAST})   -> false
 *     isPastConsuming({status:"completed", startsAt: FUTURE}) -> false
 *   The two disagreed on exactly one row - a past cancelled visit - which this
 *   file asserted, and which the ruling has now collapsed.
 */
describe("Marcar novamente renders on every appointment, past and future", () => {
  it.each(ALL)("PROFILE offers it for %s, future AND past", (status) => {
    expect(isEligibleForScheduleAgain({ status, startsAt: FUTURE })).toBe(true);
    expect(isEligibleForScheduleAgain({ status, startsAt: PAST })).toBe(true);
  });

  it.each(ALL)("DRAWER offers it for %s, future AND past", (status) => {
    expect(isPastConsuming({ status, startsAt: FUTURE })).toBe(true);
    expect(isPastConsuming({ status, startsAt: PAST })).toBe(true);
  });

  it("THE TWO SURFACES NO LONGER DISAGREE ON ANY ROW", () => {
    // The one row they used to differ on was a PAST CANCELLED visit. Asserted
    // across the whole enum and both time directions rather than on that row
    // alone, so a future re-gating of one surface cannot silently reopen the
    // split.
    for (const status of ALL) {
      for (const startsAt of [FUTURE, PAST]) {
        expect(
          isEligibleForScheduleAgain({ status, startsAt }),
          `profile/drawer disagree on ${status} ${startsAt === PAST ? "past" : "future"}`,
        ).toBe(isPastConsuming({ status, startsAt }));
      }
    }
  });
});
