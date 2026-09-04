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

/**
 * Counts the rows on which two boolean expressions disagree, in each direction.
 * `IS TRUE` on both sides so a NULL is compared as "not visible", which is what
 * a policy does with it.
 */
async function disagreements(
  tx: TransactionSql,
  left: string,
  right: string,
): Promise<{ rows: number; loosened: number; tightened: number }> {
  const [r] = await tx.unsafe(`
    SELECT count(*)::int AS rows,
           count(*) FILTER (WHERE r_ok AND NOT l_ok)::int AS loosened,
           count(*) FILTER (WHERE l_ok AND NOT r_ok)::int AS tightened
      FROM (SELECT (${left}) IS TRUE AS l_ok, (${right}) IS TRUE AS r_ok
              FROM public.appointments a) t`);
  return r as unknown as { rows: number; loosened: number; tightened: number };
}

d("0078: the visible appointment set is identical before and after", () => {
  let sql: Sql;

  const tenant = randomUUID();
  const locA = randomUUID();
  const locB = randomUUID();
  const patient = randomUUID();

  /**
   * Every appointment row in the database, counted with RLS BYPASSED.
   *
   * The anti-vacuity guard compares the scan against THIS, not against a
   * threshold: the first draft asserted `rows > 4` and passed on a lane with
   * thousands of seeded rows while telling us nothing, then failed in CI where
   * the seeded database holds fewer. What matters is not that the table is
   * large - it is that the comparison saw the rows the principal CANNOT see.
   */
  let totalAppointments = 0;

  const owner = randomUUID();
  const adminWith = randomUUID();
  const adminWithout = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();

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
       */
      const [role] = await tx`select id from roles limit 1`;
      for (const [uid, label] of [
        [owner, "owner"], [adminWith, "admin-with"], [adminWithout, "admin-without"],
        [reception, "reception"], [therapist, "therapist"], [otherTherapist, "therapist-2"],
      ] as [string, string][]) {
        await tx`insert into users (id, tenant_id, role_id, email, full_name)
                 values (${uid}, ${tenant}, ${role!.id}, ${`${label}-${uid.slice(0, 8)}@equiv.test`}, ${label})
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
       * location, at the unassigned one, and one belonging to a therapist who
       * is not the viewer.
       *
       * THERE IS NO NULL-LOCATION ROW BECAUSE THE COLUMN IS NOT NULL - checked,
       * not assumed. That makes the policy's `location_id IS NOT NULL` guard
       * unreachable against today's schema, and it is kept anyway: it is what
       * stops `NULL = ANY(...)` returning NULL instead of false if the column
       * is ever relaxed, and removing it would be a change this migration is
       * not making.
       */
      const appt = (loc: string, practitioner: string, creator: string) => ({
        id: randomUUID(),
        tenant_id: tenant,
        patient_id: patient,
        practitioner_id: practitioner,
        location_id: loc,
        created_by: creator,
        starts_at: new Date("2027-01-04T09:00:00Z"),
        ends_at: new Date("2027-01-04T10:00:00Z"),
        status: "scheduled",
      });
      await tx`select 1`;
      const rows = [
        appt(locA, therapist, owner),
        appt(locB, therapist, owner),
        appt(locA, otherTherapist, owner),
        appt(locB, otherTherapist, adminWithout),
      ];
      for (const r of rows) await tx`insert into appointments ${tx(r)}`;
    });
  });

  beforeAll(async () => {
    // The plain connection is the migration role, which bypasses RLS.
    const [t] = await sql`select count(*)::int as n from public.appointments`;
    totalAppointments = (t as { n: number }).n;
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await tx`delete from appointments where tenant_id = ${tenant}`;
      await tx`delete from staff_locations where tenant_id = ${tenant}`;
      await tx`delete from users where tenant_id = ${tenant}`;
      await tx`delete from patients where tenant_id = ${tenant}`;
      await tx`delete from locations where tenant_id = ${tenant}`;
      await tx`delete from tenants where id = ${tenant}`;
    });
    await sql.end();
  });

  const classes: [string, "owner" | "admin" | "reception" | "therapist", string][] = [
    ["owner", "owner", owner],
    ["admin WITH a location assignment", "admin", adminWith],
    ["admin WITHOUT a location assignment", "admin", adminWithout],
    ["reception", "reception", reception],
    ["therapist", "therapist", therapist],
  ];

  for (const [label, role, userId] of classes) {
    it(`${label}: sees exactly the same rows`, async () => {
      const r = await asPrincipal(sql, claimsFor(tenant, role, userId), (tx) =>
        disagreements(tx, OLD_PREDICATE, NEW_PREDICATE),
      );
      // The scan must be the WHOLE table, not a slice RLS already narrowed.
      expect(r.rows).toBe(totalAppointments);
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
      disagreements(tx, OLD_PREDICATE, loosened),
    );
    expect(r.loosened).toBeGreaterThan(0);
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
    const withSecond = randomUUID();
    await sql`insert into appointments ${sql({
      id: withSecond,
      tenant_id: tenant,
      patient_id: patient,
      practitioner_id: otherTherapist,
      practitioner_2_id: therapist,
      location_id: locA,
      created_by: owner,
      starts_at: new Date("2027-01-05T09:00:00Z"),
      ends_at: new Date("2027-01-05T10:00:00Z"),
      status: "scheduled",
    })}`;
    const r = await asPrincipal(sql, claimsFor(tenant, "therapist", therapist), (tx) =>
      disagreements(tx, OLD_PREDICATE, tightened),
    );
    expect(r.tightened).toBeGreaterThan(0);
  });
});
