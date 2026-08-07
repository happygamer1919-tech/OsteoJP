import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOCKING_STATUSES,
  NON_BLOCKING_STATUSES,
} from "./blocking-status";

// S1 AGREEMENT TEST.
//
// "Which statuses occupy a slot" is expressed in THREE places:
//
//   1. apps/api/lib/appointments/store.ts        (patient booking guard)
//   2. packages/db/migrations/0059_...sql        (appointment_conflicts, therapist)
//   3. packages/db/migrations/0059_...sql        (appointment_conflicts, room)
//
// W13-04a ADDED A FOURTH OCCUPANCY DIMENSION and a fourth site, and the regexes
// above could not see either. "Which STATUSES occupy a slot" is no longer the
// whole question: JP option B says an unconfirmed PEDIDO does not occupy one
// whatever its status. That is a second axis, and the staff free-interval
// display (apps/web/lib/scheduling/day-availability.ts) answers it too.
//
// So this file now guards TWO agreements, not one:
//   the STATUS set, across the three sites above; and
//   the PEDIDO exclusion, across those plus day-availability.ts.
//
// Extending it was mandatory rather than tidy: a pedido exclusion added to two
// of the sites and forgotten on the third would have left the portal and the
// staff agenda disagreeing about which slots are free, with CI green - which is
// the exact failure this test was written for in the first place.
//
// 0052 is the LATEST definition of appointment_conflicts and therefore the one
// in force. Reading 0048 instead would assert against a superseded body and
// pass while production disagreed.
//
// They drifted apart once before and nothing noticed, because the only thing
// asserting they matched was a comment. This test reads the actual SQL text and
// fails when one changes without the others. It tests AGREEMENT, not a specific
// value, so it keeps working through the pending S1 flip instead of having to be
// rewritten by whoever performs it.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");

/**
 * Extract every status predicate from a SQL source, normalised to the SET of
 * statuses it EXCLUDES. Handles both spellings the codebase uses:
 *   a.status <> 'cancelled'
 *   a.status not in ('cancelled','no_show')
 */
function excludedStatusSets(source: string): string[][] {
  // Strip comments FIRST. A migration header legitimately quotes the old and
  // the new predicate side by side to document what changed, and counting that
  // prose as a live predicate makes the file look self-contradictory. Same
  // lesson as the write-path scanner: a guard that fires on documentation
  // teaches people to ignore it.
  const sqlText = source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " "); // line comments

  const sets: string[][] = [];

  for (const m of sqlText.matchAll(/status\s*<>\s*'([a-z_]+)'/gi)) {
    sets.push([m[1].toLowerCase()]);
  }
  for (const m of sqlText.matchAll(/status\s+not\s+in\s*\(([^)]*)\)/gi)) {
    const items = [...m[1].matchAll(/'([a-z_]+)'/gi)].map((x) => x[1].toLowerCase());
    if (items.length) sets.push(items.sort());
  }

  return sets;
}

const APP_STORE = "apps/api/lib/appointments/store.ts";
// 0059 supersedes 0052 as the definition of appointment_conflicts. Reading 0052
// would assert against a superseded body and pass while production disagreed -
// the same reason this constant moved from 0048 to 0052.
const CONFLICT_FN = "packages/db/migrations/0059_pedido_does_not_block_slot.sql";
// W13-04a: the THIRD site. The staff free-interval display shares the occupancy
// question and was outside this guard until the pedido exclusion made it a place
// the sites could disagree.
const STAFF_AVAILABILITY = "apps/web/lib/scheduling/day-availability.ts";
/** The pedido exclusion, as every site must spell it: a call to the ONE
 *  SECURITY DEFINER function, never a hand-rolled predicate. */
const PEDIDO_EXCLUSION = /not\s+public\.is_unconfirmed_pedido\s*\(/i;

describe("S1 — the blocking-status predicate agrees across all three sites", () => {
  const appSets = excludedStatusSets(readRepo(APP_STORE));
  const fnSets = excludedStatusSets(readRepo(CONFLICT_FN));

  it("guards against a vacuous pass: each site actually yields a predicate", () => {
    // If a regex stops matching, every assertion below passes trivially.
    expect(appSets.length).toBeGreaterThan(0);
    expect(fnSets.length).toBeGreaterThan(0);
  });

  it("the SECURITY DEFINER conflict function is internally consistent", () => {
    // Therapist-overlap and room-overlap must exclude the same statuses.
    const unique = new Set(fnSets.map((s) => s.join(",")));
    expect([...unique]).toHaveLength(1);
  });

  it("the app predicate and the conflict function exclude the SAME statuses", () => {
    const appUnique = [...new Set(appSets.map((s) => s.join(",")))];
    const fnUnique = [...new Set(fnSets.map((s) => s.join(",")))];

    expect(
      appUnique,
      `Status predicates have DRIFTED.\n` +
        `  ${APP_STORE} excludes: ${appUnique.join(" | ")}\n` +
        `  ${CONFLICT_FN} excludes: ${fnUnique.join(" | ")}\n` +
        `Both must express the same set. The migration side is GREEN's lane, so ` +
        `the app flip and the migration must land together.`,
    ).toEqual(fnUnique);
  });

  it("the exported constant matches what the code actually does", () => {
    // Keeps blocking-status.ts honest: it must describe reality, not intent.
    const excluded = [...new Set(excludedStatusSets(readRepo(APP_STORE)).flat())].sort();
    expect(excluded).toEqual([...NON_BLOCKING_STATUSES].sort());
    expect(BLOCKING_STATUSES).not.toContain("cancelled");
  });

  it("S1 is APPLIED: no_show releases a slot on every site", () => {
    expect(NON_BLOCKING_STATUSES).toContain("no_show");
    expect(BLOCKING_STATUSES).not.toContain("no_show");
    expect(BLOCKING_STATUSES).toEqual(["scheduled", "confirmed", "completed"]);
  });
});


/**
 * W13-04a — the PEDIDO exclusion agrees across all FOUR sites.
 *
 * The exclusion must be spelled as a call to `public.is_unconfirmed_pedido`
 * everywhere. That is not a style rule: the two app sites CANNOT read
 * `staff_notifications` correctly under their own privileges (the patient role
 * has no grant at all; the staff role's 0055 policy is pinned to
 * `recipient_user_id = auth.uid()`), so a hand-rolled `NOT EXISTS` at either
 * site is a bug that a status-set test would never catch.
 */
describe("W13-04a — the pedido exclusion is present, and spelled the same way, at every site", () => {
  const sources: [string, string][] = [
    [APP_STORE, readRepo(APP_STORE)],
    [CONFLICT_FN, readRepo(CONFLICT_FN)],
    [STAFF_AVAILABILITY, readRepo(STAFF_AVAILABILITY)],
  ];

  /** Live code only. A migration header legitimately quotes predicates as prose,
   *  and a guard that fires on documentation teaches people to ignore it - the
   *  same lesson the status scanner above already learned. */
  const live = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/\/\/[^\n]*/g, " ");

  it("guards against a vacuous pass: every source is non-empty and readable", () => {
    for (const [name, src] of sources) {
      expect(src.length, `${name} read as empty`).toBeGreaterThan(0);
    }
  });

  it("every site excludes unconfirmed pedidos", () => {
    for (const [name, src] of sources) {
      expect(
        PEDIDO_EXCLUSION.test(live(src)),
        `${name} does not exclude unconfirmed pedidos.\n` +
          `JP option B requires all FOUR occupancy sites to agree. Shipping the ` +
          `exclusion at some sites and not others makes the portal and the staff ` +
          `agenda disagree about which slots are free, which is what PG8 exists ` +
          `to prove does not happen.`,
      ).toBe(true);
    }
  });

  it("the conflict function applies it to BOTH branches, therapist and room", () => {
    // One branch excluded and the other not would free a slot on the therapist
    // axis while still blocking on the room axis - a half-applied ruling.
    const fn = live(readRepo(CONFLICT_FN));
    const hits = fn.match(new RegExp(PEDIDO_EXCLUSION.source, "gi")) ?? [];
    expect(hits).toHaveLength(2);
  });

  it("no site hand-rolls the predicate instead of calling the function", () => {
    // The failure this catches: someone "simplifies" the call into an inline
    // EXISTS. It would pass the test above at the SQL site and ERROR at runtime
    // in apps/api, where the patient role cannot read staff_notifications.
    for (const [name, src] of sources) {
      if (name === CONFLICT_FN) continue; // the function itself is defined there
      expect(
        /appointment_request/i.test(live(src)),
        `${name} names appointment_request directly. The exclusion must go ` +
          `through public.is_unconfirmed_pedido, which is SECURITY DEFINER for ` +
          `reasons this site cannot work around.`,
      ).toBe(false);
    }
  });

  it("the function is defined once, SECURITY DEFINER, and granted to both roles", () => {
    const fn = readRepo(CONFLICT_FN);
    expect(fn).toMatch(/CREATE OR REPLACE FUNCTION public\.is_unconfirmed_pedido\(p_appointment uuid\)/);
    expect(live(fn)).toMatch(/SECURITY DEFINER/);
    // `patient` is not optional: the portal slot sweep runs under that role and
    // has no grant on staff_notifications, so without this it cannot ask at all.
    expect(live(fn)).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_unconfirmed_pedido\(uuid\) TO authenticated/);
    expect(live(fn)).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_unconfirmed_pedido\(uuid\) TO patient/);
  });
});
