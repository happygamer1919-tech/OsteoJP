import { describe, expect, it } from "vitest";

import {
  packIsActive,
  packSessionsAvailable,
  packSessionsConsumed,
  PACK_CONSUMING_STATUSES,
} from "../src/pack-balance";

/**
 * RB-02 — the balance formula.
 *
 * THE CASE THAT MATTERS MOST IS THE LEGACY ONE, and it is the first below. A
 * pure derive-from-linked-rows model returns the full total for every pacote
 * bought before 0067, because none of them has a linked appointment - silently
 * RESTORING every session already used, on real patients' balances, the day it
 * ships. `legacy_consumed` is the term that prevents it, and this file is where
 * that claim is checkable without a database.
 */

describe("packSessionsAvailable", () => {
  it("returns the pre-0067 balance EXACTLY when nothing is linked", () => {
    // The identity 0067's backfill relies on: legacyConsumed was set to
    // `total - remaining`, so with zero linked rows the derived balance is
    //   total - (total - remaining) = remaining
    // for every row, with no case analysis. A patient who had 4 of 10 left has
    // 4 of 10 left, and the production apply proved it (V3 = 0 rows wrong).
    for (const [total, remaining] of [
      [10, 4],
      [10, 10],
      [10, 0],
      [1, 1],
      [20, 13],
    ] as const) {
      const legacyConsumed = total - remaining;
      expect(
        packSessionsAvailable({ sessionsTotal: total, legacyConsumed, linkedAppointments: 0 }),
      ).toBe(remaining);
    }
  });

  it("subtracts linked appointments on top of the legacy term", () => {
    // A pacote of 10 with 3 spent before 0067 and 2 booked since has 5 left.
    expect(
      packSessionsAvailable({ sessionsTotal: 10, legacyConsumed: 3, linkedAppointments: 2 }),
    ).toBe(5);
  });

  it("clamps at zero rather than reporting a negative balance", () => {
    // Reachable: an admin re-attends a cancelled appointment, or a row's counter
    // was hand-adjusted below zero before the CHECK existed. "Minus one session"
    // is not something the clinic can act on.
    expect(
      packSessionsAvailable({ sessionsTotal: 10, legacyConsumed: 8, linkedAppointments: 5 }),
    ).toBe(0);
  });
});

describe("packSessionsConsumed", () => {
  it("is NOT total minus available, so an overdraw stays visible", () => {
    // The clamp above would hide it. 8 + 5 = 13 spent against a total of 10, and
    // 13 is the honest answer; `total - available` would say 10 and lose the
    // three that make it a problem worth looking at.
    const over = { sessionsTotal: 10, legacyConsumed: 8, linkedAppointments: 5 };
    expect(packSessionsConsumed(over)).toBe(13);
    expect(over.sessionsTotal - packSessionsAvailable(over)).toBe(10);
  });
});

describe("packIsActive", () => {
  it("is true only while sessions remain", () => {
    expect(packIsActive({ sessionsTotal: 10, legacyConsumed: 9, linkedAppointments: 0 })).toBe(true);
    expect(packIsActive({ sessionsTotal: 10, legacyConsumed: 10, linkedAppointments: 0 })).toBe(
      false,
    );
    expect(packIsActive({ sessionsTotal: 10, legacyConsumed: 0, linkedAppointments: 10 })).toBe(
      false,
    );
  });
});

describe("PACK_CONSUMING_STATUSES", () => {
  it("includes no_show, which is why the consumir button could be deleted", () => {
    // The under-24h / no-show rule used to need a manual press. A no-show is now
    // an appointment row and the formula counts it, so the rule is a consequence
    // of the data. If this ever stops being true, the rule silently stops being
    // enforced and the clinic loses the session it is owed.
    expect(PACK_CONSUMING_STATUSES).toContain("no_show");
  });

  it("does NOT include cancelled - a cancelled appointment returns its session", () => {
    expect(PACK_CONSUMING_STATUSES).not.toContain("cancelled");
  });
});
