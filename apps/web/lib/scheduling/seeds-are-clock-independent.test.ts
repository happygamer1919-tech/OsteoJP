/**
 * seeds-are-clock-independent.test.ts — THE CONTROL FOR THE PINNED SEEDS.
 *
 * ==========================================================================
 * WHY THIS IS A SOURCE SCAN AND NOT A BEHAVIOURAL TEST
 * ==========================================================================
 * The defect this guards against is a fixture that INHERITS THE TIME OF DAY.
 * `new Date(Date.now() + 5 * 24 * 3600 * 1000)` moves the date five days and
 * keeps the hour, so a suite run at 21:10 seeds an appointment at 21:10.
 *
 * On 2026-09-17 that met AGENDA-2100's clinic-hours rule on the un-cancel write
 * path and took `estado-uncancel.db.test.ts` red for THIRTEEN HOURS A DAY, on
 * every branch at once, on PRs whose diff could not reach the seed (#1394).
 *
 * A BEHAVIOURAL CONTROL CANNOT BE WRITTEN FOR THE REST OF THEM, AND SAYING SO
 * IS THE POINT. Reverting any seed below does NOT redden its own suite today:
 * measured 2026-09-17 at 21:18 Lisbon, out of hours, `estado-correction`,
 * `guest-match` and `pedido-confirm` all pass, because none of the paths they
 * exercise (`correctAppointmentEstadoAction`, two read-only list functions,
 * `confirmAppointmentRequest`) is one of `checkClinicWindow`'s five callers.
 * The hazard is LATENT: it fires the day one of those paths gains the check.
 *
 * So the falsifiable assertion available today is about the SOURCE, not the
 * outcome. Revert any pinned seed and this file goes red, at any hour. That is a
 * real control. A behavioural test that passes at all three clocks whether or
 * not the fix is present would be theatre.
 *
 * Same shape, and for the same reason, as
 * `write-paths-check-clinic-hours.test.ts`: the defect is an ABSENCE, and an
 * absence is what a behavioural test cannot notice.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function read(rel: string): string {
  return stripComments(readFileSync(join(__dirname, rel), "utf8"));
}

/** The clock-inheriting shape itself. */
const INHERITS_CLOCK = /new Date\(\s*Date\.now\(\)\s*[+-]/;

/**
 * PINNED: every seed here is an appointment-shaped instant whose offset is far
 * from any threshold, so fixing the hour cannot change what the test means.
 */
const PINNED = [
  "./estado-uncancel.db.test.ts",
  "./estado-correction.db.test.ts",
  "./pedido-confirm.db.test.ts",
  "./guest-match.db.test.ts",
  "../reminders/reminder-log.db.test.ts",
  "../followup/record-contact.db.test.ts",
] as const;

/**
 * DELIBERATELY NOT PINNED, AND THIS LIST IS THE ARGUMENT FOR WHY.
 *
 * These seed `now + 19h`, `+ 20h`, `+ 24h`, `+ 30h`. Those offsets are LOAD
 * BEARING: they sit either side of the 24h and 48h reminder offsets, and
 * `confirm-redeem.db.test.ts` carries its own comment explaining that the
 * direction must track `now` so a fixture asked for a PAST appointment stays
 * past.
 *
 * Pinning the hour moves an instant by up to 12 hours. On a 4-to-14 day offset
 * that is immaterial. On a 20-hour offset it can cross the 24h boundary and flip
 * a reminder from due to not-due — turning a latent, currently unreachable
 * hazard into a live wrong answer. So they keep inheriting the clock, on
 * purpose, and this test asserts they still do: if somebody pins one, this goes
 * red and they have to come and read this paragraph first.
 */
const NOT_PINNED = [
  "../reminders/confirm-redeem.db.test.ts",
  "../reminders/confirm-redeem-overlap.db.test.ts",
  "../reminders/redeem.db.test.ts",
  "../reminders/inbound-reply.db.test.ts",
  "../reminders/inbound-store.db.test.ts",
] as const;

describe("clock-inheriting seeds", () => {
  it("finds every file it claims to check, so nothing below passes over nothing", () => {
    // VACUOUS-PASS GUARD. A renamed or moved suite would otherwise make every
    // assertion below run against a string this test never read.
    for (const rel of [...PINNED, ...NOT_PINNED]) {
      expect(read(rel).length, `${rel} body`).toBeGreaterThan(500);
    }
  });

  for (const rel of PINNED) {
    it(`${rel} seeds no instant from the wall clock`, () => {
      expect(read(rel)).not.toMatch(INHERITS_CLOCK);
    });
  }

  for (const rel of NOT_PINNED) {
    it(`${rel} still seeds relative to now, on purpose`, () => {
      expect(read(rel)).toMatch(INHERITS_CLOCK);
    });
  }

  it("the stripper really removes prose, or every assertion above is theatre", () => {
    const pretend = stripComments(`
      // const X = new Date(Date.now() + 1);
      /* and here too: new Date(Date.now() - 1) */
      const real = 1;
    `);
    expect(pretend).not.toMatch(INHERITS_CLOCK);
  });

  it("and it does NOT remove real code, or the pinned assertions are vacuous", () => {
    // The mirror of the arm above. A stripper that ate everything would make
    // every `not.toMatch` pass against an empty string.
    expect(stripComments("const X = new Date(Date.now() + 1);")).toMatch(INHERITS_CLOCK);
  });
});
