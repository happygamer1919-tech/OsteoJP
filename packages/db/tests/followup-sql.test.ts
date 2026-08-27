import { describe, expect, it } from "vitest";

import {
  followupLastAttendanceSql,
  followupPractitionerSql,
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  followupNotPostponedClause,
  followupOwnPatientClause,
  followupSelectionPredicate,
  FOLLOWUP_BINDINGS,
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

/**
 * ==========================================================================
 * OWNER RULING 2026-08-27 - THE THERAPIST SCOPE CLAUSE, PINNED AS TEXT
 * ==========================================================================
 * The DB-gated suite proves what this clause MEANS. This one proves what it
 * SAYS, and the two failures it catches are ones a live database would report
 * only as "the wrong patients", if at all.
 */
describe("followupOwnPatientClause", () => {
  const OUT = '"patients"."id"';

  it("correlates on the outer expression the caller names, in both patient columns", () => {
    const sql = followupOwnPatientClause(OUT);
    expect(sql).toContain(`done.patient_id = ${OUT}`);
    expect(sql).toContain(`done.patient_2_id = ${OUT}`);
  });

  it("never emits the BARE column that caused the 2026-08-21 incident", () => {
    const sql = followupOwnPatientClause(OUT);
    expect(sql).not.toMatch(/done\.patient_id\s*=\s*"id"/);
  });

  it("compares the MOST RECENT completed visit, not any of them", () => {
    // THE ASSERTION THAT DISTINGUISHES THIS CLAUSE FROM THE ONE-LINER IT COULD
    // HAVE BEEN. `EXISTS (... = $4)` would satisfy every other test in this
    // file and would mean "every therapist who ever saw them".
    const sql = followupOwnPatientClause(OUT);
    expect(sql).toContain("ORDER BY done.starts_at DESC");
    expect(sql).toContain("LIMIT 1");
    expect(sql).not.toContain("EXISTS");
  });

  it("selects the PRIMARY practitioner only, matching the schema's primary-only rule", () => {
    const sql = followupOwnPatientClause(OUT);
    expect(sql).toContain("SELECT done.practitioner_id");
    expect(sql).not.toContain("practitioner_2_id");
  });

  it("only completed appointments count", () => {
    expect(followupOwnPatientClause(OUT)).toContain("done.status = 'completed'");
  });

  it("binds $4, the position FOLLOWUP_BINDINGS reserves for it", () => {
    // The positional contract, asserted rather than assumed. A caller binds by
    // POSITION, so a clause that quietly moved to $5 would compare a patient's
    // practitioner against a timestamp.
    expect(FOLLOWUP_BINDINGS[3]).toBe("therapistUserId");
    expect(followupOwnPatientClause(OUT)).toContain("= $4");
  });

  it("is NOT part of followupSelectionPredicate - the unscoped roles never get it", () => {
    // THE REGRESSION ARM, and the one that protects owner/admin/reception. If
    // the scope were ever folded into the shared predicate, every role would
    // inherit it and the page would silently empty for the front desk.
    expect(followupSelectionPredicate(OUT)).not.toContain("$4");
    expect(followupSelectionPredicate(OUT)).not.toContain("SELECT done.practitioner_id");
  });

  it("the three original clauses still bind only $1-$3", () => {
    for (const build of [
      followupLastAttendanceClause,
      followupNoFutureBookingClause,
      followupNotPostponedClause,
    ]) {
      expect(build(OUT)).not.toContain("$4");
    }
  });
});
