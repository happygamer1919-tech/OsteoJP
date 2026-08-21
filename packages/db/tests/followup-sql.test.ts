import { describe, expect, it } from "vitest";

import {
  followupLastAttendanceSql,
  followupPractitionerSql,
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  followupNotPostponedClause,
} from "../src/followup-selection";

/**
 * INC 2026-08-21 — the correlation that crashed /recuperacao in production.
 *
 * ==========================================================================
 * THIS IS THE TEST THAT WOULD HAVE CAUGHT IT, AND IT DID NOT EXIST
 * ==========================================================================
 * `pack-balance.test.ts` has had exactly this pin since the RB-02 fix, for
 * exactly this bug, in the file next door. It was written one day before the
 * page shipped and nobody applied it to the sibling query.
 *
 * The failure: interpolating a Drizzle column into a correlated subquery renders
 * the BARE `"id"`, and inside `FROM appointments done` that binds to `done.id`.
 * The predicate is never true, `max()` returns NULL, and the page crashes
 * formatting a null date — a Server Component error with only a digest.
 *
 * IT DOES NOT THROW AND IT DOES NOT WARN. Nothing about it is visible in a query
 * plan or a log until something downstream trips over the null. That is why it
 * is pinned as TEXT rather than trusted to review.
 */

const OUTER = '"patients"."id"';

describe("the correlated SELECT expressions", () => {
  it.each([
    ["followupLastAttendanceSql", followupLastAttendanceSql],
    ["followupPractitionerSql", followupPractitionerSql],
  ])("%s correlates on the outer expression the caller names", (_name, build) => {
    const sql = build(OUTER);
    expect(sql).toContain(`done.patient_id = ${OUTER}`);
    expect(sql).toContain(`done.patient_2_id = ${OUTER}`);
  });

  it.each([
    ["followupLastAttendanceSql", followupLastAttendanceSql],
    ["followupPractitionerSql", followupPractitionerSql],
  ])("%s never emits the BARE column that caused the incident", (_name, build) => {
    // The exact broken form, asserted as its own case so a future edit that
    // reintroduces it fails HERE and not on a production screen.
    const sql = build(OUTER);
    expect(sql).not.toMatch(/done\.patient_id\s*=\s*"id"/);
    expect(sql).not.toMatch(/done\.patient_2_id\s*=\s*"id"/);
  });

  it("both read the SAME completed set the WHERE clause selects on", () => {
    // The crash was survivable only because these two disagree with the WHERE
    // clause: the clause was right, so the right patients were returned with a
    // null date. If they ever diverge on `status = 'completed'`, the date shown
    // would belong to a different set of visits than the one that qualified the
    // patient, and NOTHING would crash - it would just be wrong.
    for (const build of [followupLastAttendanceSql, followupPractitionerSql]) {
      expect(build(OUTER)).toContain("done.status = 'completed'");
    }
    expect(followupLastAttendanceClause(OUTER)).toContain("done.status = 'completed'");
  });
});

describe("the WHERE clauses were never the broken part", () => {
  it.each([
    ["followupLastAttendanceClause", followupLastAttendanceClause],
    ["followupNoFutureBookingClause", followupNoFutureBookingClause],
    ["followupNotPostponedClause", followupNotPostponedClause],
  ])("%s already named its outer expression", (_name, build) => {
    // Recorded rather than assumed. These carried the qualification from the
    // day they were written, which is why the page returned the RIGHT patients
    // and only their date was null. Pinning it stops a later "tidy-up" from
    // making the clauses match the broken selects instead of the other way round.
    expect(build(OUTER)).toContain(OUTER);
  });
});
