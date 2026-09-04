/**
 * appointments-rls-equivalence.db.test.ts — the gate migration 0078 shipped
 * behind.
 *
 * ==========================================================================
 * WHAT IS BEING PROVEN, AND WHY IT IS NOT "THE NEW POLICY WORKS"
 * ==========================================================================
 * 0078 replaces one sub-expression inside `appointments_rls` for speed. The
 * only thing that makes that safe is that the VISIBLE ROW SET DOES NOT MOVE,
 * for anybody. So the assertion is an EQUALITY between the old expression and
 * the new one, evaluated over every row, for each principal class - not a set
 * of "this principal can see this row" spot checks, which is what a test of the
 * new policy alone would be.
 *
 * ==========================================================================
 * BOTH DIRECTIONS. A ONE-SIDED TEST WOULD PASS A POLICY THAT HIDES A
 * THERAPIST'S OWN PATIENTS FROM THEM.
 * ==========================================================================
 * `loosened` counts rows the NEW expression admits and the old did not - a
 * permissive RLS error, the dangerous one. `tightened` counts rows the OLD
 * admitted and the new does not - nobody's data leaks, and the clinic loses
 * access to its own diary. Both are counted and both must be zero. The two
 * negative controls at the bottom move the predicate one way each and assert
 * that this file goes red for each.
 *
 * ==========================================================================
 * FIVE CLASSES, AND ONE OF THEM DOES NOT EXIST ON PRODUCTION
 * ==========================================================================
 * The same comparison was run read-only against production over all 28 staff
 * principals and all 41,558 appointment rows before the migration was applied:
 * loosened 0, tightened 0. But production has NO admin without a location
 * assignment - all three of its admins have one - so that class could not be
 * covered there and is covered here with a fixture. It is the class where the
 * two expressions are most obviously equal (the OR short-circuits before either
 * form is reached) and therefore the one it would be easiest to skip.
 *
 * ==========================================================================
 * INC-0078: EVERY ASSERTION HERE IS IMMUNE TO A CONCURRENT WRITER. IT WAS NOT.
 * ==========================================================================
 * Vitest runs test FILES in parallel processes against ONE database, and about
 * a dozen sibling files in packages/db INSERT into public.appointments and
 * COMMIT. The first version of this file failed roughly two runs in three, in
 * two separate ways, and both were this file's fault:
 *
 *   1. It counted every appointment row once in a `beforeAll`, then asserted
 *      that each principal's scan returned THAT number. Between the count and
 *      the scan, siblings committed rows - `expected 12 to be 10`. The count
 *      was a PROXY for the property that matters ("the scan was not narrowed by
 *      RLS"), and a proxy measured at a different instant than the thing it
 *      guards is a race by construction. It is now asserted directly, with
 *      `row_security_active`, inside the very statement that does the scan; and
 *      the anti-vacuity half is asserted against THIS FILE'S OWN rows, which no
 *      other file can touch because the tenant is a fresh uuid.
 *
 *   2. It took its `users.role_id` from `select id from roles limit 1` - a role
 *      row belonging to WHOEVER happened to be seeded. `roles` cascades from
 *      `tenants` but `users.role_id` has no ON DELETE action, so this file's
 *      users PINNED another file's role, and that file's teardown then died on
 *      `users_role_id_roles_id_fk`. It reported as a failed SUITE in the
 *      innocent file while the summary still said "1165 passed" and the run
 *      exited non-zero. The fixture now creates its own role in its own tenant,
 *      which is what every other file in this directory already did.
 *
 * The rule the two share: a shared-database test may only assert over rows it
 * owns, and must assert the property it means rather than a number that
 * happens to equal it.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Rollback, claimsFor, connect, live } from "./rls-harness";

const d = live ? describe : describe.skip;

/** The policy as it stands BEFORE 0078: a function call per row. */
const OLD_PREDICATE = `
  ((a.tenant_id = (SELECT public.jwt_tenant_id()))
   AND ((a.created_by = (SELECT auth.uid()))
        OR ((SELECT public.jwt_role()) = 'owner')
        OR (((SELECT public.jwt_role()) = 'therapist')
            AND ((a.practitioner_id = (SELECT auth.uid()))
                 OR (a.practitioner_2_id = (SELECT auth.uid()))))
        OR (((SELECT public.jwt_role()) = ANY (ARRAY['admin','reception']))
            AND ((NOT (SELECT public.viewer_has_location_assignment()))
                 OR ((a.location_id IS NOT NULL)
                     AND public.location_in_viewer_scope(a.location_id))))))`;

/** 0078: the same rule as set membership, evaluated once. */
const NEW_PREDICATE = `
  ((a.tenant_id = (SELECT public.jwt_tenant_id()))
   AND ((a.created_by = (SELECT auth.uid()))
        OR ((SELECT public.jwt_role()) = 'owner')
        OR (((SELECT public.jwt_role()) = 'therapist')
            AND ((a.practitioner_id = (SELECT auth.uid()))
                 OR (a.practitioner_2_id = (SELECT auth.uid()))))
        OR (((SELECT public.jwt_role()) = ANY (ARRAY['admin','reception']))
            AND ((NOT (SELECT public.viewer_has_location_assignment()))
                 OR ((a.location_id IS NOT NULL)
                     AND (a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))))))))`;

/**
 * Sets a principal's claims and evaluates, WITHOUT dropping to `authenticated`.
 *
 * ==========================================================================
 * THE COMPARISON MUST NOT BE SUBJECT TO THE POLICY IT IS TESTING, AND THE
 * FIRST DRAFT OF THIS FILE WAS.
 * ==========================================================================
 * It ran the comparison under `set local role authenticated`, so RLS filtered
 * the scan to the rows the CURRENT policy already admits - and a row the old
 * policy excludes cannot appear as "loosened" if it is not in the scan at all.
 * Every one of the five class assertions passed, vacuously, over two rows.
 *
 * The negative control below is what caught it: it loosened the predicate
 * until an assigned admin would see the whole tenant, and `loosened` still came
 * back 0. A file with only the five positive cases would have shipped.
 *
 * So the claims are set and the ROLE IS NOT CHANGED: the harness connects as
 * the migration role, which bypasses RLS, while `auth.uid()` and `jwt_role()`
 * still read the claims. The production run of scripts/0078-equivalence.sql has
 * the same property, and its output proves it - 41,558 rows scanned per
 * principal is the whole table, not a filtered slice.
 */
async function asPrincipal<T>(
  sql: Sql,
  claims: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      throw new Rollback(await fn(tx));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.value;
    throw e;
  }
  throw new Error("unreachable");
}

type Comparison = {
  /**
   * Whether RLS is being applied to the scan below. MUST be false: it is the
   * property the whole file rests on, asserted in the same statement as the
   * scan rather than inferred from a row count taken at another moment.
   */
  rlsApplied: boolean;
  /**
   * Every row scanned, this file's and every other file's. REPORTED, NEVER
   * ASSERTED ON: sibling suites commit appointment rows throughout the run, so
   * this number is not stable and an equality on it is the INC-0078 race.
   */
  rows: number;
  loosened: number;
  tightened: number;
  /** Rows scanned that belong to THIS file's two tenants. Deterministic. */
  fixtureRows: number;
  /** Of those, the ones the OLD predicate excludes for this principal. */
  fixtureInvisible: number;
};

/**
 * Counts the rows on which two boolean expressions disagree, in each direction.
 * `IS TRUE` on both sides so a NULL is compared as "not visible", which is what
 * a policy does with it.
 *
 * `loosened` and `tightened` are computed over the WHOLE table on purpose and
 * are immune to concurrent writers for a reason worth stating: a sibling file's
 * row carries a different tenant_id, and the tenant guard is the same text on
 * BOTH sides of the comparison, so such a row is false=false and cannot land in
 * either counter. Concurrency changes how many rows are scanned; it cannot
 * change what the scan concludes.
 */
async function disagreements(
  tx: TransactionSql,
  fixtureTenants: string[],
  left: string,
  right: string,
): Promise<Comparison> {
  const [r] = await tx.unsafe(
    `
    SELECT row_security_active('public.appointments') AS rls_applied,
           count(*)::int AS rows,
           count(*) FILTER (WHERE r_ok AND NOT l_ok)::int AS loosened,
           count(*) FILTER (WHERE l_ok AND NOT r_ok)::int AS tightened,
           count(*) FILTER (WHERE fixture)::int AS fixture_rows,
           count(*) FILTER (WHERE fixture AND NOT l_ok)::int AS fixture_invisible
      FROM (SELECT (${left}) IS TRUE AS l_ok,
                   (${right}) IS TRUE AS r_ok,
                   (a.tenant_id = ANY ($1::uuid[])) AS fixture
              FROM public.appointments a) t`,
    [fixtureTenants as unknown as string],
  );
  const row = r as unknown as {
    rls_applied: boolean;
    rows: number;
    loosened: number;
    tightened: number;
    fixture_rows: number;
    fixture_invisible: number;
  };
  return {
    rlsApplied: row.rls_applied,
    rows: row.rows,
    loosened: row.loosened,
    tightened: row.tightened,
    fixtureRows: row.fixture_rows,
    fixtureInvisible: row.fixture_invisible,
  };
}

d("0078: the visible appointment set is identical before and after", () => {
  let sql: Sql;

  const tenant = randomUUID();
  const role = randomUUID();
  const locA = randomUUID();
  const locB = randomUUID();
  const patient = randomUUID();

  /**
   * A SECOND tenant, holding exactly one appointment.
   *
   * It is what makes the anti-vacuity guard below deterministic for the two
   * classes that can see everything in their own tenant - `owner`, and the
   * admin with no location assignment. Without it those two would have no row
   * in the fixture they cannot see, and their guard would have to lean on
   * whatever other suites happened to have committed at that instant, which is
   * the habit this rewrite exists to remove.
   */
  const foreignTenant = randomUUID();
  const foreignRole = randomUUID();
  const foreignLoc = randomUUID();
  const foreignUser = randomUUID();
  const foreignPatient = randomUUID();

  const owner = randomUUID();
  const adminWith = randomUUID();
  const adminWithout = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();

  const fixtureTenants = [tenant, foreignTenant];

  /**
   * The fixture's exact size: five rows in `tenant`, one in `foreignTenant`.
   *
   * This is the ANTI-VACUITY GUARD, and it replaces an equality against a
   * count of the whole table taken in a `beforeAll`. What the old guard was
   * trying to say is "the comparison saw rows this principal CANNOT see" - it
   * said it with a number that a sibling suite could move between the counting
   * and the scanning. This says the same thing about rows no other file can
   * reach, so it is exact on every run.
   */
  const FIXTURE_ROWS = 6;

  beforeAll(async () => {
    sql = connect();
    await sql.begin(async (tx) => {
      await tx`insert into tenants (id, name, slug) values (${tenant}, 'rls-equiv', ${`rls-equiv-${tenant.slice(0, 8)}`}) on conflict do nothing`;
      await tx`insert into locations (id, tenant_id, name) values
        (${locA}, ${tenant}, 'A'), (${locB}, ${tenant}, 'B') on conflict do nothing`;
      await tx`insert into patients (id, tenant_id, full_name, primary_location_id)
               values (${patient}, ${tenant}, 'Equiv Patient', ${locA}) on conflict do nothing`;
      /**
       * The five principals need `users` rows: staff_locations carries a FK to
       * them, and a fixture that skipped it would fail at insert rather than
       * quietly test nothing - which is the good kind of failure and is why it
       * is worth saying that this is a FK and not decoration.
       *
       * The ROLE is this tenant's own, not `select id from roles limit 1`.
       * That borrowed a row from another suite's tenant, and because
       * `users.role_id` has no ON DELETE action while `roles` cascades from
       * `tenants`, these users then blocked that suite's teardown with a
       * foreign-key error attributed to ITS file. See INC-0078 in the header.
       */
      await tx`insert into roles (id, tenant_id, slug, name)
               values (${role}, ${tenant}, 'admin', 'Admin') on conflict do nothing`;
      for (const [uid, label] of [
        [owner, "owner"], [adminWith, "admin-with"], [adminWithout, "admin-without"],
        [reception, "reception"], [therapist, "therapist"], [otherTherapist, "therapist-2"],
      ] as [string, string][]) {
        await tx`insert into users (id, tenant_id, role_id, email, full_name)
                 values (${uid}, ${tenant}, ${role}, ${`${label}-${uid.slice(0, 8)}@equiv.test`}, ${label})
                 on conflict do nothing`;
      }

      /**
       * staff_locations is what decides which arm of the OR is reached, so the
       * fixture's whole job is to put a principal on each side of it:
       * adminWith and reception are assigned to locA, adminWithout is assigned
       * to nothing, and the therapists are not location-scoped at all.
       */
      await tx`insert into staff_locations (tenant_id, user_id, location_id) values
        (${tenant}, ${adminWith}, ${locA}),
        (${tenant}, ${reception}, ${locA}) on conflict do nothing`;

      /**
       * Rows chosen so every branch of the policy is exercised by at least one
       * row AND at least one row falls OUTSIDE it: appointments at the assigned
       * location, at the unassigned one, one belonging to a therapist who is
       * not the viewer, and one where the viewer is the SECOND practitioner.
       *
       * THERE IS NO NULL-LOCATION ROW BECAUSE THE COLUMN IS NOT NULL - checked,
       * not assumed. That makes the policy's `location_id IS NOT NULL` guard
       * unreachable against today's schema, and it is kept anyway: it is what
       * stops `NULL = ANY(...)` returning NULL instead of false if the column
       * is ever relaxed, and removing it would be a change this migration is
       * not making.
       */
      const appt = (
        loc: string,
        practitioner: string,
        creator: string,
        practitioner2: string | null = null,
      ) => ({
        id: randomUUID(),
        tenant_id: tenant,
        patient_id: patient,
        practitioner_id: practitioner,
        practitioner_2_id: practitioner2,
        location_id: loc,
        created_by: creator,
        starts_at: new Date("2027-01-04T09:00:00Z"),
        ends_at: new Date("2027-01-04T10:00:00Z"),
        status: "scheduled",
      });
      const rows = [
        appt(locA, therapist, owner),
        appt(locB, therapist, owner),
        appt(locA, otherTherapist, owner),
        appt(locB, otherTherapist, adminWithout),
        /**
         * The second-practitioner row. It is seeded HERE and not inside the
         * `tightened` negative control that needs it: a test that grows the
         * fixture makes every count in this file depend on the order vitest
         * happens to run them in, which is the same class of defect as the
         * stale total it replaced.
         */
        appt(locA, otherTherapist, owner, therapist),
      ];
      for (const r of rows) await tx`insert into appointments ${tx(r)}`;

      // The foreign tenant: one row nobody in `tenant` can ever see.
      await tx`insert into tenants (id, name, slug) values (${foreignTenant}, 'rls-equiv-foreign', ${`rls-equiv-f-${foreignTenant.slice(0, 8)}`}) on conflict do nothing`;
      await tx`insert into roles (id, tenant_id, slug, name)
               values (${foreignRole}, ${foreignTenant}, 'admin', 'Admin') on conflict do nothing`;
      await tx`insert into locations (id, tenant_id, name) values (${foreignLoc}, ${foreignTenant}, 'F') on conflict do nothing`;
      await tx`insert into users (id, tenant_id, role_id, email, full_name)
               values (${foreignUser}, ${foreignTenant}, ${foreignRole}, ${`foreign-${foreignUser.slice(0, 8)}@equiv.test`}, 'foreign')
               on conflict do nothing`;
      await tx`insert into patients (id, tenant_id, full_name, primary_location_id)
               values (${foreignPatient}, ${foreignTenant}, 'Foreign Patient', ${foreignLoc}) on conflict do nothing`;
      await tx`insert into appointments ${tx({
        id: randomUUID(),
        tenant_id: foreignTenant,
        patient_id: foreignPatient,
        practitioner_id: foreignUser,
        location_id: foreignLoc,
        created_by: foreignUser,
        starts_at: new Date("2027-01-04T09:00:00Z"),
        ends_at: new Date("2027-01-04T10:00:00Z"),
        status: "scheduled",
      })}`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await tx`delete from appointments where tenant_id in (${tenant}, ${foreignTenant})`;
      await tx`delete from staff_locations where tenant_id in (${tenant}, ${foreignTenant})`;
      await tx`delete from users where tenant_id in (${tenant}, ${foreignTenant})`;
      await tx`delete from patients where tenant_id in (${tenant}, ${foreignTenant})`;
      await tx`delete from locations where tenant_id in (${tenant}, ${foreignTenant})`;
      await tx`delete from roles where tenant_id in (${tenant}, ${foreignTenant})`;
      await tx`delete from tenants where id in (${tenant}, ${foreignTenant})`;
    });
    await sql.end();
  });

  /**
   * Asserted on EVERY comparison, the five classes and both negative controls:
   * the scan was not subject to RLS, and it saw all six fixture rows.
   */
  function expectWholeTableScan(r: Comparison): void {
    expect({ rlsApplied: r.rlsApplied, fixtureRows: r.fixtureRows }).toEqual({
      rlsApplied: false,
      fixtureRows: FIXTURE_ROWS,
    });
  }

  /**
   * The five classes, each with the number of FIXTURE rows the policy as it
   * stands today hides from that principal. Every one is greater than zero,
   * which is the anti-vacuity property; the exact value is carried because a
   * fixture that stopped covering a class would otherwise still pass.
   *
   *   owner            1  the foreign row only - `owner` sees its whole tenant
   *   admin WITH       3  the two locB rows, plus the foreign row
   *   admin WITHOUT    1  the foreign row only - no assignment means no scoping
   *   reception        3  same two locB rows as the assigned admin
   *   therapist        3  the two rows they neither run nor assist on, plus the
   *                       foreign row
   */
  const classes: [string, "owner" | "admin" | "reception" | "therapist", string, number][] = [
    ["owner", "owner", owner, 1],
    ["admin WITH a location assignment", "admin", adminWith, 3],
    ["admin WITHOUT a location assignment", "admin", adminWithout, 1],
    ["reception", "reception", reception, 3],
    ["therapist", "therapist", therapist, 3],
  ];

  for (const [label, principalRole, userId, invisible] of classes) {
    it(`${label}: sees exactly the same rows`, async () => {
      const r = await asPrincipal(sql, claimsFor(tenant, principalRole, userId), (tx) =>
        disagreements(tx, fixtureTenants, OLD_PREDICATE, NEW_PREDICATE),
      );
      expectWholeTableScan(r);
      // The comparison saw rows this principal CANNOT see. Without this the
      // five cases could pass over a slice that excludes every disagreement.
      expect(r.fixtureInvisible).toBe(invisible);
      expect({ loosened: r.loosened, tightened: r.tightened }).toEqual({
        loosened: 0,
        tightened: 0,
      });
    });
  }

  /**
   * THE NEGATIVE CONTROLS, in the file rather than in a transcript.
   *
   * They do not mutate the product; they hand `disagreements` a deliberately
   * wrong right-hand side and assert it is CAUGHT. That is what proves the
   * comparison above can fail at all - and it is the property the five cases
   * cannot demonstrate about themselves.
   */
  it("CATCHES a loosened predicate - the permissive error", async () => {
    // Drops the location test entirely: an assigned admin would see every row.
    const loosened = NEW_PREDICATE.replace(
      "AND (a.location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[])))",
      "AND true",
    );
    expect(loosened).not.toBe(NEW_PREDICATE);
    const r = await asPrincipal(sql, claimsFor(tenant, "admin", adminWith), (tx) =>
      disagreements(tx, fixtureTenants, OLD_PREDICATE, loosened),
    );
    expectWholeTableScan(r);
    // Exactly the two locB rows: the count is this file's own, so it is stated
    // exactly rather than as "greater than zero".
    expect(r.loosened).toBe(2);
  });

  it("CATCHES a tightened predicate - the one a one-sided test would pass", async () => {
    // A therapist arm narrowed to the primary practitioner only. Nobody's data
    // leaks; a therapist stops seeing appointments where they are the SECOND
    // practitioner, which is a real loss and must still redden this file.
    const tightened = NEW_PREDICATE.replace(
      "OR (a.practitioner_2_id = (SELECT auth.uid()))",
      "OR false",
    );
    expect(tightened).not.toBe(NEW_PREDICATE);
    const r = await asPrincipal(sql, claimsFor(tenant, "therapist", therapist), (tx) =>
      disagreements(tx, fixtureTenants, OLD_PREDICATE, tightened),
    );
    expectWholeTableScan(r);
    // Exactly the seeded second-practitioner row.
    expect(r.tightened).toBe(1);
  });
});
