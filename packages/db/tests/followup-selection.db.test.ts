/**
 * followup-selection.db.test.ts — RB-01's THREE SELECTION CLAUSES, against a
 * real Postgres.
 *
 * ==========================================================================
 * IT IMPORTS THE PREDICATE. IT DOES NOT RESTATE IT.
 * ==========================================================================
 * The clause text comes from `@osteojp/db`'s `followup-selection`, the same
 * module `apps/web/lib/followup/queries.ts` builds its query from. A test that
 * re-typed the SQL would prove that THIS FILE's idea of the rule works, which is
 * worth nothing the moment the rule changes and only one copy is updated.
 *
 * That is not a hypothetical risk on this project. `LE-apply-block-expectation-drift`
 * was carded on 2026-08-20, the same day as this card, from a verification query
 * written for one version of a function, never regenerated when the function
 * changed, which then fired a FALSE STOP mid-apply against production. A drifted
 * selection test is worse in one respect: it does not stop anything, it goes
 * GREEN while asserting yesterday's rule.
 *
 * ==========================================================================
 * EVERY CASE IS ONE CLAUSE, ALONE - IN BOTH DIRECTIONS
 * ==========================================================================
 * Each fixture patient differs from the qualifying one in exactly ONE respect,
 * and roughly a third of them are POSITIVE controls: cases that must be
 * INCLUDED, because a clause that over-excludes fails silently. An over-strict
 * predicate renders an empty list, and an empty list reads as good news on a
 * screen whose empty state says "nobody to contact".
 * A suite that seeded "a good patient" and "a bad patient" would go green
 * against an implementation that had two of the three clauses backwards, and
 * criterion F on `ACC-vacuous-guard-sweep` is the reason that matters: a guard
 * proves a test RAN, only the assertion proves it tested the right SUBJECT.
 *
 * Gated on DATABASE_URL, so `vitest run` with no database stays green and the
 * DB-gated required check runs it.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  followupLastAttendanceSql,
  followupPractitionerSql,
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  followupNotPostponedClause,
  followupOwnPatientClause,
  followupSelectionPredicate,
} from "../src/followup-selection";
import { connect, live } from "./rls-harness";

const tenant = randomUUID();
const role = randomUUID();
const user = randomUUID();
/**
 * TWO THERAPISTS. Owner ruling 2026-08-27 scopes /recuperacao for a therapist to
 * the patients whose MOST RECENT COMPLETED CONSULTATION WAS THEIRS, and the only
 * way to prove a scope is to have somebody it must exclude. One therapist plus
 * "everybody else" would go green against a clause that matched every row.
 */
const therapistRole = randomUUID();
const THERAPIST_A = randomUUID();
const THERAPIST_B = randomUUID();
const location = randomUUID();
const service = randomUUID();

/** Fixed instants, so nothing here depends on the day the suite runs. */
const NOW = new Date("2026-08-20T12:00:00Z");
const WINDOW_FROM = new Date("2026-06-30T23:00:00Z"); // 1 July 00:00 Lisbon
const WINDOW_TO = new Date("2026-08-13T12:00:00Z"); // NOW - 7 days

/** Inside the window: seen on 20 July. */
const IN_WINDOW = new Date("2026-07-20T09:00:00Z");
/** After the window closes: seen three days ago, too soon to chase. */
const TOO_RECENT = new Date("2026-08-17T09:00:00Z");
/** Before the window opens: seen in February, a different conversation. */
const TOO_OLD = new Date("2026-02-10T09:00:00Z");

type Patient = { id: string; label: string };
const mk = (label: string): Patient => ({ id: randomUUID(), label });

const QUALIFIES = mk("qualifies");
const SEEN_TOO_RECENTLY = mk("seen too recently");
const SEEN_TOO_LONG_AGO = mk("seen too long ago");
const HAS_FUTURE_BOOKING = mk("has a future booking");
const FUTURE_CANCELLED = mk("future appointment is cancelled");
const POSTPONED = mk("postponed");
const POSTPONE_EXPIRED = mk("postponement expired");
const POSTPONE_REVOKED = mk("postponement revoked");
const NEVER_ATTENDED = mk("never attended");

/* ---- Owner ruling 2026-08-27: the therapist scope's own fixtures ---- */
/** Last completed visit was with A. A sees them; B must not. */
const A_ONLY = mk("z-scope A only");
/** Last completed visit was with B. B sees them; A must not. */
const B_ONLY = mk("z-scope B only");
/**
 * Seen by A in the window, then by B LATER and still inside the window.
 *
 * THE CASE THAT SEPARATES "MOST RECENT" FROM "EVER", and the reason the clause
 * is a LIMIT 1 subquery rather than an EXISTS. Under `EXISTS (... = $4)` this
 * patient belongs to BOTH therapists, while the row's own practitioner column
 * would name only B - so A would be shown a patient whose visible clinician is
 * somebody else. Under the shipped clause the patient is B's alone.
 */
const A_THEN_B = mk("z-scope A then B");

const ALL = [
  QUALIFIES,
  SEEN_TOO_RECENTLY,
  SEEN_TOO_LONG_AGO,
  HAS_FUTURE_BOOKING,
  FUTURE_CANCELLED,
  POSTPONED,
  POSTPONE_EXPIRED,
  POSTPONE_REVOKED,
  NEVER_ATTENDED,
  A_ONLY,
  B_ONLY,
  A_THEN_B,
];

let sql: Sql;

async function appointment(
  patient: string,
  startsAt: Date,
  status: string,
  practitioner: string = user,
): Promise<void> {
  const ends = new Date(startsAt.getTime() + 60 * 60 * 1000);
  await sql`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
               starts_at, ends_at, status)
            values (${randomUUID()}, ${tenant}, ${patient}, ${practitioner}, ${location},
                    ${service}, ${startsAt}, ${ends}, ${status}::appointment_status)`;
}

beforeAll(async () => {
  if (!live) return;
  sql = connect();
  await sql`insert into tenants (id, name, slug)
            values (${tenant}, 'Followup Selection', ${`fsel-${tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${role}, ${tenant}, 'reception', 'Rececao')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${user}, ${tenant}, ${role}, ${`fs-${user}@example.pt`}, 'Seed Reception')`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${therapistRole}, ${tenant}, 'therapist', 'Terapeuta')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${THERAPIST_A}, ${tenant}, ${therapistRole}, ${`ta-${THERAPIST_A}@example.pt`}, 'Terapeuta A')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${THERAPIST_B}, ${tenant}, ${therapistRole}, ${`tb-${THERAPIST_B}@example.pt`}, 'Terapeuta B')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${location}, ${tenant}, 'Seed Clinic')`;
  await sql`insert into services (id, tenant_id, name, duration_min, price_cents)
            values (${service}, ${tenant}, 'Seed Service', 60, 5000)`;
  for (const p of ALL) {
    await sql`insert into patients (id, tenant_id, full_name)
              values (${p.id}, ${tenant}, ${p.label})`;
  }

  // ONE completed attendance in the window for everybody who should be
  // eligible on clause 1, so the OTHER cases differ in exactly one respect.
  await appointment(QUALIFIES.id, IN_WINDOW, "completed");
  await appointment(HAS_FUTURE_BOOKING.id, IN_WINDOW, "completed");
  await appointment(FUTURE_CANCELLED.id, IN_WINDOW, "completed");
  await appointment(POSTPONED.id, IN_WINDOW, "completed");
  await appointment(POSTPONE_EXPIRED.id, IN_WINDOW, "completed");
  await appointment(POSTPONE_REVOKED.id, IN_WINDOW, "completed");

  // Clause 1 arms.
  await appointment(SEEN_TOO_RECENTLY.id, IN_WINDOW, "completed");
  await appointment(SEEN_TOO_RECENTLY.id, TOO_RECENT, "completed"); // MAX wins
  await appointment(SEEN_TOO_LONG_AGO.id, TOO_OLD, "completed");
  // NEVER_ATTENDED gets nothing at all.

  // Clause 2 arms.
  await appointment(HAS_FUTURE_BOOKING.id, new Date("2026-09-01T09:00:00Z"), "scheduled");
  await appointment(FUTURE_CANCELLED.id, new Date("2026-09-01T09:00:00Z"), "cancelled");

  // Owner ruling 2026-08-27 arms. All three QUALIFY on clauses 1-3, so the only
  // thing that can separate them is the therapist clause.
  await appointment(A_ONLY.id, IN_WINDOW, "completed", THERAPIST_A);
  await appointment(B_ONLY.id, IN_WINDOW, "completed", THERAPIST_B);
  await appointment(A_THEN_B.id, IN_WINDOW, "completed", THERAPIST_A);
  await appointment(A_THEN_B.id, new Date("2026-08-01T09:00:00Z"), "completed", THERAPIST_B);

  // Clause 3 arms.
  const post = (patient: string, until: Date, revoked: boolean) =>
    sql`insert into patient_followup_postponements
          (id, tenant_id, patient_id, postponed_until, created_by, revoked_by, revoked_at)
        values (${randomUUID()}, ${tenant}, ${patient}, ${until}, ${user},
                ${revoked ? user : null}, ${revoked ? NOW : null})`;
  await post(POSTPONED.id, new Date("2026-10-01T00:00:00Z"), false);
  await post(POSTPONE_EXPIRED.id, new Date("2026-08-01T00:00:00Z"), false);
  await post(POSTPONE_REVOKED.id, new Date("2026-10-01T00:00:00Z"), true);
});

afterAll(async () => {
  if (!live) return;
  await sql`delete from patient_followup_postponements where tenant_id = ${tenant}`;
  await sql`delete from appointments where tenant_id = ${tenant}`;
  await sql`delete from patients where tenant_id = ${tenant}`;
  await sql`delete from services where tenant_id = ${tenant}`;
  await sql`delete from locations where tenant_id = ${tenant}`;
  await sql`delete from users where tenant_id = ${tenant}`;
  await sql`delete from roles where tenant_id = ${tenant}`;
  await sql`delete from tenants where id = ${tenant}`;
  await sql.end();
});

/**
 * Runs a predicate over this tenant's patients and returns the labels selected.
 *
 * THE TENANT MOVED FROM `$4` TO `$5` on 2026-08-27, and it had to: `$4` is now
 * `therapistUserId` in `FOLLOWUP_BINDINGS`, which is the positional contract the
 * clause builders and `apps/web/lib/followup/queries.ts` both honour. A test
 * binding its own meaning to `$4` would be asserting against a different
 * predicate from the one the app runs - the exact drift this whole file exists
 * to prevent.
 *
 * `therapist` is null for the unscoped roles. Nothing in the three original
 * clauses references `$4`, so binding null there changes none of their results.
 */
async function selected(predicate: string, therapist: string | null = null): Promise<string[]> {
  const rows = await sql.unsafe(
    `select full_name from patients
      where tenant_id = $5 and (${predicate})
      order by full_name`,
    [WINDOW_FROM, WINDOW_TO, NOW, therapist, tenant],
  );
  return rows.map((r) => r.full_name as string);
}

describe.skipIf(!live)("INC 2026-08-21 - the SELECT expressions return a real date", () => {
  /**
   * THE FIXTURE THAT REPRODUCES THE PRODUCTION SHAPE.
   *
   * The crash needed exactly one thing the seeded suite never had: a patient who
   * QUALIFIES, so the page renders a row and formats its date. `QUALIFIES` above
   * is that patient. Before the fix these two subqueries returned NULL for him -
   * the predicate correlated `done.patient_id` to `done.id` - and the page
   * called toLocaleDateString on it.
   *
   * IT ASSERTS THE VALUE, NOT MERELY NON-NULL. A non-null assertion would pass
   * against a subquery correlated to the WRONG patient, which is the other half
   * of what a bare column could have produced.
   */
  it("last attendance is the seeded date, not null", async () => {
    const rows = await sql.unsafe(
      `select ${followupLastAttendanceSql("patients.id")} as last_at
         from patients where tenant_id = $1 and full_name = $2`,
      [tenant, QUALIFIES.label],
    );
    const row = rows[0];
    if (!row) throw new Error("fixture patient missing - the suite is asserting nothing");
    expect(row.last_at).not.toBeNull();
    expect(new Date(row.last_at as string).toISOString()).toBe(IN_WINDOW.toISOString());
  });

  it("the practitioner is the one who saw them, not null", async () => {
    const rows = await sql.unsafe(
      `select ${followupPractitionerSql("patients.id")} as who
         from patients where tenant_id = $1 and full_name = $2`,
      [tenant, QUALIFIES.label],
    );
    const row = rows[0];
    if (!row) throw new Error("fixture patient missing - the suite is asserting nothing");
    expect(row.who).toBe("Seed Reception");
  });

  it("a patient with NO completed attendance yields null, which the page must tolerate", async () => {
    // The honest null. The page may still meet one - a row selected on a future
    // rule change, or a race - so the boundary is asserted here and the page
    // guards it rather than assuming it cannot happen.
    const rows = await sql.unsafe(
      `select ${followupLastAttendanceSql("patients.id")} as last_at
         from patients where tenant_id = $1 and full_name = $2`,
      [tenant, NEVER_ATTENDED.label],
    );
    expect(rows[0]?.last_at ?? null).toBeNull();
  });
});

describe.skipIf(!live)("RB-01 selection predicate (migration 0067)", () => {
  it("the WHOLE predicate selects the four that qualify and none of the five that do not", async () => {
    /**
     * ==================================================================
     * THIS ASSERTION WAS WRONG ON ITS FIRST RUN AND THE CODE WAS RIGHT.
     * ==================================================================
     * It expected `[QUALIFIES]` alone, on the description "eight patients differ
     * in one respect each, and none of them may appear". That sentence was false
     * about three of the eight, and the per-clause tests below said so at the
     * same time - they assert `toContain` for exactly these three. **The suite
     * contradicted itself**, and the database is what noticed.
     *
     * THREE OF THE FIXTURES ARE POSITIVE CONTROLS, NOT NEGATIVE ONES. Each was
     * built to prove a clause does NOT over-exclude, which is the direction that
     * fails silently: an over-strict clause shows an empty list, and an empty
     * list looks like good news on a screen that says "nobody to contact".
     *   - `FUTURE_CANCELLED` — a cancelled future appointment is not a booking.
     *     They are the patient who dropped out and whom nobody chased.
     *   - `POSTPONE_EXPIRED` — a postponement is a pause, not a deletion.
     *   - `POSTPONE_REVOKED` — "bring back" has to actually bring them back.
     *
     * So the list is asserted in BOTH directions, by name. A test that only
     * pinned the four would go green against a predicate that dropped a clause
     * and let a fifth in.
     */
    const got = await selected(followupSelectionPredicate("patients.id"));

    // THE THREE SCOPE FIXTURES ARE IN THIS LIST ON PURPOSE. They qualify on all
    // three clauses - which is what makes them able to prove anything about the
    // FOURTH. If the therapist clause ever leaked into
    // `followupSelectionPredicate`, they would drop out here and this assertion
    // is what would say so.
    expect(got).toEqual(
      [QUALIFIES, FUTURE_CANCELLED, POSTPONE_EXPIRED, POSTPONE_REVOKED, A_ONLY, B_ONLY, A_THEN_B]
        .map((p) => p.label)
        .sort(),
    );

    for (const excluded of [
      SEEN_TOO_RECENTLY,
      SEEN_TOO_LONG_AGO,
      HAS_FUTURE_BOOKING,
      POSTPONED,
      NEVER_ATTENDED,
    ]) {
      expect(got).not.toContain(excluded.label);
    }
  });

  describe("clause 1 - the MOST RECENT completed attendance is in the window", () => {
    it("excludes a patient seen since the window closed, even though they were ALSO seen inside it", async () => {
      // THE CASE THAT DISTINGUISHES max() FROM exists(). `SEEN_TOO_RECENTLY`
      // has a completed attendance inside the window AND one three days ago. An
      // `EXISTS ... BETWEEN` implementation selects them, and reception rings a
      // patient they saw on Monday.
      const got = await selected(followupLastAttendanceClause("patients.id"));
      expect(got).not.toContain(SEEN_TOO_RECENTLY.label);
      expect(got).toContain(QUALIFIES.label);
    });

    it("excludes a patient last seen before the window opened", async () => {
      expect(await selected(followupLastAttendanceClause("patients.id"))).not.toContain(
        SEEN_TOO_LONG_AGO.label,
      );
    });

    it("excludes a patient who has never attended at all", async () => {
      // max() over no rows is NULL, and `NULL BETWEEN a AND b` is NULL, which
      // WHERE treats as false. Asserted rather than reasoned about: a three-value
      // logic mistake here would put every patient who never came on the list.
      expect(await selected(followupLastAttendanceClause("patients.id"))).not.toContain(
        NEVER_ATTENDED.label,
      );
    });
  });

  describe("clause 2 - no future booking", () => {
    it("excludes a patient with a scheduled future appointment", async () => {
      expect(await selected(followupNoFutureBookingClause("patients.id"))).not.toContain(
        HAS_FUTURE_BOOKING.label,
      );
    });

    it("INCLUDES a patient whose only future appointment is CANCELLED", async () => {
      // The clause's whole point, and the direction it would be wrong in
      // silently: a cancelled future appointment is exactly the patient who
      // dropped out and whom nobody chased. Counting it as a booking hides them.
      expect(await selected(followupNoFutureBookingClause("patients.id"))).toContain(
        FUTURE_CANCELLED.label,
      );
    });
  });

  describe("clause 3 - not currently postponed", () => {
    it("excludes a patient with an active postponement", async () => {
      expect(await selected(followupNotPostponedClause("patients.id"))).not.toContain(
        POSTPONED.label,
      );
    });

    it("INCLUDES a patient whose postponement has expired", async () => {
      // A postponement is a pause, not a deletion. If this were a presence check
      // rather than a comparison against now, a patient postponed once would
      // never return to the list.
      expect(await selected(followupNotPostponedClause("patients.id"))).toContain(
        POSTPONE_EXPIRED.label,
      );
    });

    it("INCLUDES a patient whose postponement was REVOKED", async () => {
      // The reversal is recorded rather than deleted (0067 grants no DELETE), so
      // the row is still there. A clause that ignored `revoked_at` would leave
      // "bring back" doing nothing at all, which is the exact defect a recorded
      // reversal is supposed to make impossible.
      expect(await selected(followupNotPostponedClause("patients.id"))).toContain(
        POSTPONE_REVOKED.label,
      );
    });
  });
});

/**
 * ==========================================================================
 * OWNER RULING 2026-08-27 - THE THERAPIST SCOPE, AGAINST A REAL POSTGRES
 * ==========================================================================
 * The ruling's three acceptance lines, one `it` each, plus the case that
 * distinguishes this clause from the shorter one it could have been.
 *
 * WHY THIS BELONGS AT THE DATABASE AND NOT IN A UNIT TEST. The clause is a
 * correlated `ORDER BY ... LIMIT 1` subquery, and every defect this page has
 * shipped was a claim the runtime did not honour - a column that bound
 * elsewhere, an alias that did not exist, a type that did not convert. A unit
 * test over the SQL TEXT (which `followup-sql.test.ts` also does, and should)
 * proves what was written. Only Postgres proves what it means.
 */
describe.skipIf(!live)("owner ruling 2026-08-27 - the therapist sees their own patients", () => {
  /** The whole page predicate as a therapist runs it: the three clauses AND the scope. */
  const scoped = (patientIdExpr: string) =>
    `${followupSelectionPredicate(patientIdExpr)}\n  AND ${followupOwnPatientClause(patientIdExpr)}`;

  it("a therapist sees ONLY their own patients", async () => {
    const got = await selected(scoped("patients.id"), THERAPIST_A);
    expect(got).toEqual([A_ONLY.label]);
  });

  it("a therapist does NOT see another therapist's patient", async () => {
    // The negative arm of the test above, stated separately because it is the
    // acceptance line the ruling exists for. Asserted by NAME, not by count: a
    // clause that returned the wrong single row would satisfy a count.
    const got = await selected(scoped("patients.id"), THERAPIST_A);
    expect(got).not.toContain(B_ONLY.label);
    expect(got).not.toContain(QUALIFIES.label);
  });

  it("the OTHER therapist sees theirs, so the clause is not simply empty", async () => {
    // LEARNINGS entry 5. A clause that returned nothing for everybody would pass
    // both assertions above and prove only that it selects no rows.
    const got = await selected(scoped("patients.id"), THERAPIST_B);
    expect(got).toEqual([A_THEN_B.label, B_ONLY.label].sort());
  });

  it("owner and reception still see all - the clause is not applied to them", async () => {
    // THE REGRESSION ARM. The unscoped roles bind no `$4` and the clause is not
    // appended, so their result is the full qualifying set - the same one the
    // predicate test above pins. If the scope ever became unconditional, this is
    // the assertion that turns red.
    const got = await selected(followupSelectionPredicate("patients.id"));
    expect(got).toContain(A_ONLY.label);
    expect(got).toContain(B_ONLY.label);
    expect(got).toContain(QUALIFIES.label);
  });

  it("'MOST RECENT', not 'ever': a patient A saw first and B saw last is B's alone", async () => {
    // THE CASE THAT KILLS THE SHORTER IMPLEMENTATION. Under
    // `EXISTS (... practitioner_id = $4)` this patient belongs to both, and A
    // would be shown a row whose own practitioner column names B.
    const a = await selected(scoped("patients.id"), THERAPIST_A);
    const b = await selected(scoped("patients.id"), THERAPIST_B);
    expect(a).not.toContain(A_THEN_B.label);
    expect(b).toContain(A_THEN_B.label);
  });

  it("the scope row and the DISPLAYED practitioner are the same row", async () => {
    // The property the clause was shaped for: same completed set, same
    // ORDER BY starts_at DESC LIMIT 1. A therapist can never be shown a patient
    // whose visible clinician is somebody else.
    const rows = await sql.unsafe(
      `select full_name, ${followupPractitionerSql("patients.id")} as who
         from patients where tenant_id = $5 and (${scoped("patients.id")})`,
      [WINDOW_FROM, WINDOW_TO, NOW, THERAPIST_B, tenant],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.who).toBe("Terapeuta B");
  });
});
