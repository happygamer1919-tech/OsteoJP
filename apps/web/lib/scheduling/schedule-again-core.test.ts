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

describe("isPastConsuming — the agenda drawer's gate", () => {
  // THE PIN. This is a NODE test, so it may import the database constant that a
  // "use client" component must never reach (importing @osteojp/db there pulls
  // the postgres driver into the browser bundle and the page will not build).
  // The predicate is written as "not cancelled"; this asserts that answer agrees
  // with PACK_CONSUMING_STATUSES for every status the enum actually has, in both
  // directions, so the two cannot drift apart in silence.
  it("agrees with PACK_CONSUMING_STATUSES on EVERY status in the enum", () => {
    for (const status of ALL) {
      const consuming = (PACK_CONSUMING_STATUSES as readonly string[]).includes(status);
      expect(isPastConsuming({ status, startsAt: PAST }, NOW)).toBe(consuming);
    }
  });

  it("covers the whole enum — a status added without updating ALL would slip through", () => {
    // PACK_CONSUMING_STATUSES holds four of the five; the fifth is `cancelled`.
    expect(new Set([...PACK_CONSUMING_STATUSES, "cancelled"])).toEqual(new Set(ALL));
  });

  it("requires the instant to be PAST, whatever the status", () => {
    for (const status of ALL) {
      expect(isPastConsuming({ status, startsAt: FUTURE }, NOW)).toBe(false);
    }
  });
});

describe("isEligibleForScheduleAgain — the patient profile's WIDER gate", () => {
  it("offers a past CANCELLED visit, which the drawer's gate does not", () => {
    // The one row the two gates disagree on, asserted so the divergence is a
    // decision on the record rather than something a reader has to notice.
    const cancelled = { status: "cancelled" as const, startsAt: PAST };
    expect(isEligibleForScheduleAgain(cancelled, NOW)).toBe(true);
    expect(isPastConsuming(cancelled, NOW)).toBe(false);
  });

  it("offers a FUTURE completed visit (status wins over the instant)", () => {
    expect(isEligibleForScheduleAgain({ status: "completed", startsAt: FUTURE }, NOW)).toBe(true);
  });

  it("does NOT offer a future scheduled visit — the ordinary upcoming case", () => {
    expect(isEligibleForScheduleAgain({ status: "scheduled", startsAt: FUTURE }, NOW)).toBe(false);
  });
});
