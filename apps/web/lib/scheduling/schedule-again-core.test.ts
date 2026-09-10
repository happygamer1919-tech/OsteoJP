import { describe, expect, it } from "vitest";
import { PACK_CONSUMING_STATUSES } from "@osteojp/db";
import { isEligibleForScheduleAgain, isPastConsuming } from "./schedule-again-core";
import type { AppointmentStatusValue } from "./types";

const ALL: AppointmentStatusValue[] = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];
const PAST = "2020-01-02T09:00:00.000Z";
const FUTURE = "2099-01-02T09:00:00.000Z";
const NOW = Date.parse("2026-09-06T12:00:00.000Z");

/**
 * ==========================================================================
 * REWRITTEN BY B6. FOUR ASSERTIONS WERE RETIRED, AND WHY IS THE POINT.
 * ==========================================================================
 * The owner ruled 2026-09-10 that Marcar novamente renders on EVERY
 * appointment, past and future, whatever the estado. Both predicates are now
 * unconditional, so four cases that pinned the OLD gates are gone:
 *
 *   "agrees with PACK_CONSUMING_STATUSES on EVERY status"   the gate no longer
 *                                                           consults it at all
 *   "requires the instant to be PAST, whatever the status"  it no longer does
 *   "offers a past CANCELLED visit, which the drawer's
 *    gate does not"                                         they no longer differ
 *   "does NOT offer a future scheduled visit"               it now does
 *
 * THE PACK PIN IS THE ONE WORTH EXPLAINING RATHER THAN JUST DELETING. It
 * existed because `isPastConsuming` RESTATED the consuming-status rule in plain
 * TypeScript - the client may not import `@osteojp/db`, since that pulls the
 * postgres driver into the browser bundle and the page stops building - and the
 * pin stopped the restatement drifting from the constant. With the predicate no
 * longer expressing that rule, the pin guards a relationship that does not
 * exist; keeping it would assert a coupling the code has dropped.
 *
 * WHAT SURVIVES IS THE HALF THAT WAS NEVER ABOUT THE GATE: the enum-coverage
 * case. It asserts that `ALL` really is the whole status enum, which is what
 * makes every `it.each(ALL)` in this directory mean something. It does not
 * depend on the gate's rule and it keeps the driver-free import boundary
 * documented in a NODE test where the import is legal.
 *
 * The after-state of the ruling is asserted in marcar-novamente.test.ts, which
 * also records the before-state it replaced.
 */
describe("the status enum this directory's it.each(ALL) loops depend on", () => {
  it("covers the whole enum — a status added without updating ALL would slip through", () => {
    // PACK_CONSUMING_STATUSES holds four of the five; the fifth is `cancelled`.
    // Still a NODE test, so importing @osteojp/db here is legal and is the
    // reason the client-side restatement exists at all.
    expect(new Set([...PACK_CONSUMING_STATUSES, "cancelled"])).toEqual(new Set(ALL));
  });
});

describe("both gates are unconditional after the 2026-09-10 ruling", () => {
  it("neither gate consults the status", () => {
    for (const status of ALL) {
      expect(isPastConsuming({ status, startsAt: PAST }, NOW), status).toBe(true);
      expect(isEligibleForScheduleAgain({ status, startsAt: PAST }, NOW), status).toBe(true);
    }
  });

  it("neither gate consults the instant", () => {
    for (const startsAt of [PAST, FUTURE]) {
      expect(isPastConsuming({ status: "scheduled", startsAt }, NOW)).toBe(true);
      expect(isEligibleForScheduleAgain({ status: "scheduled", startsAt }, NOW)).toBe(true);
    }
  });
});
