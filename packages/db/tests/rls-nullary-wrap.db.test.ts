/**
 * MIGRATION 0071 — the nullary RLS helper is wrapped, and the visible SET is
 * unchanged. SR-22.
 *
 * ==========================================================================
 * WHAT HAS TO BE PROVED, AND WHY A COUNT IS NOT IT
 * ==========================================================================
 * 0071 rewrites two RLS policies. The only defensible proof that a policy
 * rewrite is safe is that it selects THE SAME ROWS, and "the same number of
 * rows" is not that: two different sets of the same size pass a count check
 * identically. So every assertion below compares ORDERED ID LISTS, and the
 * lists are additionally required to be non-empty and to DIFFER between roles -
 * otherwise "everything is empty" would satisfy the whole file.
 *
 * ==========================================================================
 * THE A/B IS REAL, IN ONE DATABASE, AND THAT IS THE POINT
 * ==========================================================================
 * A test that only asserts the post-0071 matrix proves the matrix, not the
 * migration: it would pass equally on a policy that had always been wrapped.
 * So each case computes BOTH sides here:
 *
 *   AFTER   `select id from patients` as `authenticated`. The SHIPPED policy
 *           governs, so this is whatever 0071 left behind.
 *   BEFORE  the same claims on the OWNER connection - which bypasses RLS - with
 *           the pre-0071 UNWRAPPED predicate written out inline, transcribed
 *           from 0047 and 0049.
 *
 * The helpers are all SECURITY DEFINER and read `request.jwt.claims`, so they
 * evaluate identically on either connection. If the two lists agree for every
 * principal, the wrap changed no row's visibility.
 *
 * ==========================================================================
 * THE NEGATIVE ARM
 * ==========================================================================
 * `describes the wrapped form` reads the policy back out of `pg_policy` and
 * requires the nullary call to be inside a SELECT. Against the pre-0071
 * database that is RED: the expression reads `NOT viewer_has_location_assignment()`.
 *
 * And the SCOPE GUARD, which is the other half: the three CORRELATED helpers
 * must still be UNWRAPPED. Wrapping one of those would freeze a single row's
 * answer and apply it to every row - a security defect dressed as an
 * optimisation - so a migration that over-reached would redden here rather
 * than pass for looking faster.
 *
 * GATING: needs a live privileged DATABASE_URL with 0071 applied. Skipped
 * without one, exactly like every other suite in this directory.
 */
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const F = {
  tenant: randomUUID(),
  ownerU: randomUUID(),
  adminA: randomUUID(),
  adminUnassigned: randomUUID(),
  receptionA: randomUUID(),
  therapistT: randomUUID(),
  otherT: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  pA: randomUUID(),
  pB: randomUUID(),
  pSecondaryA: randomUUID(),
  pFallbackB: randomUUID(),
  pNowhere: randomUUID(),
};

const T0 = "2026-05-06T09:00:00Z";
const T1 = "2026-05-06T10:00:00Z";
const T2 = "2026-05-07T09:00:00Z";
const T3 = "2026-05-07T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values (${F.tenant}, 'W0071', ${`w0071-${F.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${F.ownerU},          ${F.tenant}, ${`o-${F.ownerU}@x.pt`},  'Owner'),
    (${F.adminA},          ${F.tenant}, ${`a-${F.adminA}@x.pt`},  'Admin A'),
    (${F.adminUnassigned}, ${F.tenant}, ${`u-${F.adminUnassigned}@x.pt`}, 'Admin Unassigned'),
    (${F.receptionA},      ${F.tenant}, ${`r-${F.receptionA}@x.pt`}, 'Reception A'),
    (${F.therapistT},      ${F.tenant}, ${`t-${F.therapistT}@x.pt`}, 'Therapist T'),
    (${F.otherT},          ${F.tenant}, ${`x-${F.otherT}@x.pt`},  'Other T')`;
  await p`insert into locations (id, tenant_id, name) values
    (${F.locA}, ${F.tenant}, 'Loc A'), (${F.locB}, ${F.tenant}, 'Loc B')`;
  // adminA + receptionA at LocA only. adminUnassigned deliberately has none, so
  // the `NOT viewer_has_location_assignment()` branch - the one 0071 touches -
  // is the branch that decides their answer.
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${F.tenant}, ${F.adminA},     ${F.locA}),
    (${F.tenant}, ${F.receptionA}, ${F.locA})`;
  await p`insert into patients (id, tenant_id, full_name) values
    (${F.pA},          ${F.tenant}, 'P A'),
    (${F.pB},          ${F.tenant}, 'P B'),
    (${F.pSecondaryA}, ${F.tenant}, 'P Secondary A'),
    (${F.pNowhere},    ${F.tenant}, 'P Nowhere')`;
  await p`insert into patients (id, tenant_id, full_name, primary_location_id)
          values (${F.pFallbackB}, ${F.tenant}, 'P Fallback B', ${F.locB})`;
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${F.tenant}, ${F.pA}, ${F.therapistT}, ${F.locA}, ${T0}, ${T1}),
    (${F.tenant}, ${F.pB}, ${F.otherT},     ${F.locB}, ${T0}, ${T1})`;
  await p`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id, starts_at, ends_at)
          values (${F.tenant}, ${F.pA}, ${F.pSecondaryA}, ${F.otherT}, ${F.locA}, ${T2}, ${T3})`;
}

const md5 = (ids: string[]) => createHash("md5").update(ids.join(",")).digest("hex");

/** What the SHIPPED policy lets this principal see. */
async function afterPatients(sql: Sql, claims: string): Promise<string[]> {
  return asRole(sql, "authenticated", claims, async (tx) =>
    ((await tx`select id::text as id from patients order by id`) as { id: string }[]).map(
      (r) => r.id,
    ),
  );
}
async function afterAppointments(sql: Sql, claims: string): Promise<string[]> {
  return asRole(sql, "authenticated", claims, async (tx) =>
    ((await tx`select id::text as id from appointments order by id`) as { id: string }[]).map(
      (r) => r.id,
    ),
  );
}

/**
 * What the PRE-0071 predicate would have let this principal see. Transcribed
 * from 0047's `patients_select` USING clause with the nullary call UNWRAPPED,
 * run on the owner connection where RLS does not apply.
 */
async function beforePatients(sql: Sql, claims: string): Promise<string[]> {
  const rows = (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return tx`
      select id::text as id from patients
       where tenant_id = (select public.jwt_tenant_id())
         and (
           created_by = (select auth.uid())
           or (select public.jwt_role()) = 'owner'
           or (
             (select public.jwt_role()) in ('admin', 'reception')
             and (
               NOT public.viewer_has_location_assignment()
               or public.patient_appt_at_viewer_location(id)
               or (primary_location_id is not null and public.location_in_viewer_scope(primary_location_id))
             )
           )
           or (
             (select public.jwt_role()) = 'therapist'
             and public.patient_appt_treated_by_viewer(id)
           )
         )
       order by id`;
  })) as { id: string }[];
  return rows.map((r) => r.id);
}

/** The same, for 0049's `appointments_rls` USING clause. */
async function beforeAppointments(sql: Sql, claims: string): Promise<string[]> {
  const rows = (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return tx`
      select id::text as id from appointments
       where tenant_id = (select public.jwt_tenant_id())
         and (
           created_by = (select auth.uid())
           or (select public.jwt_role()) = 'owner'
           or (
             (select public.jwt_role()) = 'therapist'
             and (practitioner_id = (select auth.uid()) or practitioner_2_id = (select auth.uid()))
           )
           or (
             (select public.jwt_role()) in ('admin', 'reception')
             and (
               NOT public.viewer_has_location_assignment()
               or (location_id is not null and public.location_in_viewer_scope(location_id))
             )
           )
         )
       order by id`;
  })) as { id: string }[];
  return rows.map((r) => r.id);
}

describe.skipIf(!live)("0071 wraps the nullary helper and changes no row's visibility", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    await sql`delete from appointments where tenant_id = ${F.tenant}`;
    await sql`delete from patients where tenant_id = ${F.tenant}`;
    await sql`delete from staff_locations where tenant_id = ${F.tenant}`;
    await sql`delete from locations where tenant_id = ${F.tenant}`;
    await sql`delete from users where tenant_id = ${F.tenant}`;
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  /* ================================================================== */
  /* THE NEGATIVE ARM                                                    */
  /* ================================================================== */

  it("patients_select carries the nullary helper INSIDE a select (red before 0071)", async () => {
    const [row] = (await sql`
      select pg_get_expr(polqual, polrelid) as expr
        from pg_policy where polname = 'patients_select'`) as { expr: string }[];
    expect(row).toBeDefined();
    // Postgres renders `(select f())` as `( SELECT f() AS f)`. The pre-0071 text
    // is a bare `NOT viewer_has_location_assignment()`.
    expect(row!.expr).toMatch(/SELECT\s+viewer_has_location_assignment/i);
  });

  it("appointments_rls carries it in BOTH halves (using and with check)", async () => {
    const [row] = (await sql`
      select pg_get_expr(polqual, polrelid)      as using_expr,
             pg_get_expr(polwithcheck, polrelid) as check_expr
        from pg_policy where polname = 'appointments_rls'`) as {
      using_expr: string;
      check_expr: string;
    }[];
    expect(row).toBeDefined();
    expect(row!.using_expr).toMatch(/SELECT\s+viewer_has_location_assignment/i);
    expect(row!.check_expr).toMatch(/SELECT\s+viewer_has_location_assignment/i);
  });

  it("SCOPE GUARD: the three CORRELATED helpers are still unwrapped", async () => {
    // Wrapping one of these would evaluate it once for the whole statement and
    // apply one row's answer to every row. 0071 must not have touched them, and
    // a future migration must not either.
    const [p] = (await sql`
      select pg_get_expr(polqual, polrelid) as expr
        from pg_policy where polname = 'patients_select'`) as { expr: string }[];
    const [a] = (await sql`
      select pg_get_expr(polqual, polrelid) as expr
        from pg_policy where polname = 'appointments_rls'`) as { expr: string }[];
    for (const fn of [
      "patient_appt_at_viewer_location",
      "location_in_viewer_scope",
      "patient_appt_treated_by_viewer",
    ]) {
      expect(p!.expr).toContain(fn);
      expect(p!.expr).not.toMatch(new RegExp(`SELECT\\s+${fn}`, "i"));
    }
    expect(a!.expr).toContain("location_in_viewer_scope");
    expect(a!.expr).not.toMatch(/SELECT\s+location_in_viewer_scope/i);
  });

  /* ================================================================== */
  /* SET EQUALITY, PER PRINCIPAL                                         */
  /* ================================================================== */

  const principals: { name: string; claims: () => string }[] = [
    { name: "owner", claims: () => claimsFor(F.tenant, "owner", F.ownerU) },
    { name: "admin assigned to LocA", claims: () => claimsFor(F.tenant, "admin", F.adminA) },
    {
      name: "admin with NO assignment (the branch 0071 touches)",
      claims: () => claimsFor(F.tenant, "admin", F.adminUnassigned),
    },
    { name: "reception assigned to LocA", claims: () => claimsFor(F.tenant, "reception", F.receptionA) },
    { name: "therapist T", claims: () => claimsFor(F.tenant, "therapist", F.therapistT) },
  ];

  for (const p of principals) {
    it(`patients: identical ORDERED id list for ${p.name}`, async () => {
      const after = await afterPatients(sql, p.claims());
      const before = await beforePatients(sql, p.claims());
      expect(after).toEqual(before);
      expect(md5(after)).toBe(md5(before));
    });

    it(`appointments: identical ORDERED id list for ${p.name}`, async () => {
      const after = await afterAppointments(sql, p.claims());
      const before = await beforeAppointments(sql, p.claims());
      expect(after).toEqual(before);
      expect(md5(after)).toBe(md5(before));
    });
  }

  /* ================================================================== */
  /* THE ANTI-VACUITY CHECKS                                             */
  /* ================================================================== */

  it("the sets are non-empty and are NOT the same for every role", async () => {
    // Without this the whole file passes on a database where nobody can see
    // anything, which is the shape PORTAL-REHYDRATE 1.3 keeps cataloguing.
    const ownerSet = await afterPatients(sql, claimsFor(F.tenant, "owner", F.ownerU));
    const adminA = await afterPatients(sql, claimsFor(F.tenant, "admin", F.adminA));
    const therapist = await afterPatients(sql, claimsFor(F.tenant, "therapist", F.therapistT));

    // `F`'s values are `randomUUID()`, whose type is the template-literal uuid
    // form; widen once so the membership test is a plain string compare.
    const fixtureIds = Object.values(F) as string[];
    const mine = (ids: string[]) => ids.filter((id) => fixtureIds.includes(id));
    expect(mine(ownerSet).length).toBeGreaterThan(0);
    expect(mine(adminA).length).toBeGreaterThan(0);
    expect(mine(therapist).length).toBeGreaterThan(0);

    // The owner sees the fixture's LocB-only patient; a LocA admin does not.
    expect(ownerSet).toContain(F.pB);
    expect(adminA).not.toContain(F.pB);
    // A therapist sees their own patients, not LocA's roster.
    expect(therapist).toContain(F.pA);
    expect(therapist).not.toContain(F.pB);
  });

  it("the unassigned-admin branch actually returns the whole tenant", async () => {
    // This is the branch `NOT viewer_has_location_assignment()` decides, and it
    // is the one 0071 rewrites. If the wrap had changed its meaning, this is
    // where it would show.
    const unassigned = await afterPatients(sql, claimsFor(F.tenant, "admin", F.adminUnassigned));
    for (const id of [F.pA, F.pB, F.pSecondaryA, F.pFallbackB, F.pNowhere]) {
      expect(unassigned).toContain(id);
    }
  });
});
