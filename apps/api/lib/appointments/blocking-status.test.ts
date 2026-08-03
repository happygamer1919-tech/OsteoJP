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
//   2. packages/db/migrations/0052_...sql        (appointment_conflicts, therapist)
//   3. packages/db/migrations/0052_...sql        (appointment_conflicts, room)
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
const CONFLICT_FN = "packages/db/migrations/0052_conflicts_no_show_releases_slot.sql";

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
