/**
 * MIGRATION 0073 — patients_select resolves the viewer's visible-patient set
 * ONCE per statement, and the visible SET is unchanged. SR-33.
 *
 * ==========================================================================
 * WHAT HAS TO BE PROVED, AND WHY THE VISIBILITY HALF IS NOT ENOUGH
 * ==========================================================================
 * 0073 rewrites ONE branch of ONE policy for SPEED. Two independent things
 * therefore have to hold, and only one of them is about rows:
 *
 *   1. SAME ROWS. Every principal sees exactly what it saw before, compared as
 *      an ORDERED ID LIST hashed with md5 — never as a count, because two
 *      different sets of the same size pass a count check identically.
 *
 *   2. EVALUATED ONCE. The set is computed as an InitPlan, `loops=1`, instead
 *      of a correlated call per row. THIS IS THE HALF THAT CATCHES A REVERT.
 *      The old and the new predicate select the SAME rows by construction, so
 *      a suite that only compared visibility would stay GREEN if somebody put
 *      the two correlated helpers back — the 700 ms would return and nothing
 *      would go red. The evaluation-count assertions are the tripwire.
 *
 * The second is written as an assertion about the PLAN and the POLICY TEXT
 * rather than about milliseconds. A wall-clock threshold in a required CI job
 * is a flake with a countdown on it, and a flaky gate gets muted — which is
 * the failure family PORTAL-REHYDRATE 1.3 catalogues. `loops=1` is the same
 * property measured deterministically: it is exactly what the 872 ms -> 215 ms
 * was a symptom of.
 *
 * ==========================================================================
 * THE A/B IS REAL, IN ONE DATABASE
 * ==========================================================================
 *   AFTER   `select id from patients` as `authenticated`. The SHIPPED policy
 *           governs, so this is whatever 0073 left behind.
 *   BEFORE  the same claims on the OWNER connection — which bypasses RLS — with
 *           the PRE-0073 predicate written out inline, transcribed from 0071.
 *
 * Every helper is SECURITY DEFINER and reads `request.jwt.claims`, so both
 * sides evaluate identically. If the lists agree for every principal, the
 * rewrite changed no row's visibility.
 *
 * GATING: needs a live privileged DATABASE_URL with 0073 applied. Skipped
 * without one, exactly like every other suite in this directory.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const F = {
  tenant: randomUUID(),
  otherTenant: randomUUID(),
  ownerU: randomUUID(),
  adminA: randomUUID(),
  adminUnassigned: randomUUID(),
  receptionA: randomUUID(),
  therapistT: randomUUID(),
  otherT: randomUUID(),
  outsider: randomUUID(),
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
  await p`insert into tenants (id, name, slug) values
    (${F.tenant},      'W0073',     ${`w0073-${F.tenant}`}),
    (${F.otherTenant}, 'W0073 out', ${`w0073o-${F.otherTenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${F.ownerU},          ${F.tenant}, ${`o-${F.ownerU}@x.pt`},  'Owner'),
    (${F.adminA},          ${F.tenant}, ${`a-${F.adminA}@x.pt`},  'Admin A'),
    (${F.adminUnassigned}, ${F.tenant}, ${`u-${F.adminUnassigned}@x.pt`}, 'Admin Unassigned'),
    (${F.receptionA},      ${F.tenant}, ${`r-${F.receptionA}@x.pt`}, 'Reception A'),
    (${F.therapistT},      ${F.tenant}, ${`t-${F.therapistT}@x.pt`}, 'Therapist T'),
    (${F.otherT},          ${F.tenant}, ${`x-${F.otherT}@x.pt`},  'Other T'),
    (${F.outsider},        ${F.otherTenant}, ${`z-${F.outsider}@x.pt`}, 'Outsider')`;
  await p`insert into locations (id, tenant_id, name) values
    (${F.locA}, ${F.tenant}, 'Loc A'), (${F.locB}, ${F.tenant}, 'Loc B')`;
  // adminA + receptionA at LocA only. adminUnassigned deliberately has none, so
  // the `NOT viewer_has_location_assignment()` branch — the one 0073 leaves
  // alone — is the branch that decides their answer.
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
  // pSecondaryA is reachable ONLY through patient_2_id, at LocA. If the set
  // followed patient_id alone this row would vanish for the LocA admin.
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

/**
 * What the PRE-0073 predicate would have let this principal see. Transcribed
 * from 0071's `patients_select` USING clause — the two CORRELATED calls in the
 * admin/reception branch that 0073 replaces — run on the owner connection where
 * RLS does not apply.
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
               NOT (select public.viewer_has_location_assignment())
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

/** The policy expression as Postgres renders it back. */
async function policyExpr(sql: Sql, name: string): Promise<string> {
  const [row] = (await sql`
    select pg_get_expr(polqual, polrelid) as expr
      from pg_policy where polname = ${name}`) as { expr: string }[];
  expect(row).toBeDefined();
  return row!.expr;
}

describe.skipIf(!live)("0073 resolves the visible-patient set once, and changes no row's visibility", () => {
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
    await sql`delete from users where tenant_id in (${F.tenant}, ${F.otherTenant})`;
    await sql`delete from tenants where id in (${F.tenant}, ${F.otherTenant})`;
    await sql.end();
  });

  /* ================================================================== */
  /* THE TWO HELPERS, AS DECLARED                                        */
  /* ================================================================== */

  const helpers = ["viewer_location_ids", "viewer_visible_patient_ids"];

  for (const fn of helpers) {
    it(`${fn} is nullary, STABLE, SECURITY DEFINER and owned by postgres`, async () => {
      const [row] = (await sql`
        select p.pronargs, p.provolatile, p.prosecdef, r.rolname as owner,
               p.proacl is not null as has_acl
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          join pg_roles r     on r.oid = p.proowner
         where n.nspname = 'public' and p.proname = ${fn}`) as {
        pronargs: number;
        provolatile: string;
        prosecdef: boolean;
        owner: string;
        has_acl: boolean;
      }[];
      expect(row).toBeDefined();
      // NO PARAMETERS is the whole licence for evaluating it once per statement:
      // a function with no per-row input cannot vary by row. The correlated
      // helpers take one, which is why they are not wrapped (SR-23).
      expect(row!.pronargs).toBe(0);
      expect(row!.provolatile).toBe("s"); // STABLE
      expect(row!.prosecdef).toBe(true);
      expect(row!.owner).toBe("postgres"); // 0060
      // A NULL acl means "defaults", and Supabase's defaults include anon.
      expect(row!.has_acl).toBe(true);
    });

    it(`${fn} is EXECUTE-able by authenticated ONLY — not anon, not patient, not PUBLIC`, async () => {
      const rows = (await sql`
        select coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee,
               a.privilege_type
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace,
               aclexplode(p.proacl) a
         where n.nspname = 'public' and p.proname = ${fn}
         order by 1`) as { grantee: string; privilege_type: string }[];
      const executors = rows.filter((r) => r.privilege_type === "EXECUTE").map((r) => r.grantee);
      expect(executors).toContain("authenticated");
      // 0072's own post-check caught Supabase's ALTER DEFAULT PRIVILEGES leaving
      // `anon` with EXECUTE on a new function — callable over PostgREST by an
      // unauthenticated request. REVOKE ... FROM PUBLIC does not touch it.
      expect(executors).not.toContain("anon");
      expect(executors).not.toContain("patient");
      expect(executors).not.toContain("PUBLIC");
    });

    it(`${fn} derives the viewer from claims and staff_locations, and takes nothing from the caller`, async () => {
      const [row] = (await sql`
        select pg_get_functiondef(p.oid) as def
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = ${fn}`) as { def: string }[];
      expect(row).toBeDefined();
      const body = row!.def;
      // The viewer's identity comes from the JWT, never from an argument -
      // directly through auth.uid() in viewer_location_ids(), and through
      // viewer_location_ids() itself in viewer_visible_patient_ids().
      expect(body).toMatch(/auth\.uid\(\)|viewer_location_ids\(\)/);
      expect(body).toMatch(/jwt_tenant_id\(\)/);
      expect(body).toMatch(/staff_locations|viewer_location_ids/);
      // No parameter reaches the body, which is what makes once-per-statement
      // evaluation sound. pronargs asserts the signature; this asserts the SQL.
      expect(body).not.toMatch(/\$[1-9]/);
      // Never NULL: a NULL array makes `= ANY` return NULL, which a policy reads
      // as "not visible" — an unassigned viewer would silently see nothing.
      expect(body).toMatch(/coalesce/i);
    });
  }

  it("neither helper returns NULL for a viewer with no assignment at all", async () => {
    const claims = claimsFor(F.tenant, "admin", F.adminUnassigned);
    const [row] = (await asRole(sql, "authenticated", claims, async (tx) =>
      tx`select public.viewer_location_ids()        as locs,
                public.viewer_visible_patient_ids() as pats`,
    )) as { locs: string[]; pats: string[] }[];
    expect(row!.locs).toEqual([]);
    expect(row!.pats).toEqual([]);
  });

  /* ================================================================== */
  /* THE EVALUATION-COUNT ARM — what a revert reddens                    */
  /* ================================================================== */

  it("patients_select tests SET MEMBERSHIP, and the two correlated calls are GONE from that branch", async () => {
    const expr = await policyExpr(sql, "patients_select");
    // Postgres renders `(select f())` as `( SELECT f() AS f)`.
    expect(expr).toMatch(/SELECT\s+viewer_visible_patient_ids/i);
    expect(expr).not.toContain("patient_appt_at_viewer_location");
    expect(expr).not.toContain("location_in_viewer_scope");
    // The nullary wrap 0071 put in is still there.
    expect(expr).toMatch(/SELECT\s+viewer_has_location_assignment/i);
    // THE THERAPIST BRANCH USED TO BE ASSERTED HERE AS AN UNWRAPPED CORRELATED
    // CALL, and 0074 (SR-35 part B) gave it the same visible-set shape this
    // file proves for admin/reception. The correlated helper is not gone from
    // the schema - it still serves patients_update and patients_delete, and
    // rls-therapist-treated-set.db.test.ts asserts that. What changed is which
    // policy calls it, so this file asserts the branch's NEW shape instead of
    // the old one's location.
    expect(expr).toMatch(/SELECT\s+viewer_treated_patient_ids/i);
    expect(expr).not.toContain("patient_appt_treated_by_viewer");
  });

  it("THE TIMING ASSERTION: the set is computed ONCE per statement, not once per row", async () => {
    // This is the assertion that goes red on a revert to the 0072 predicate.
    // The two predicates select the same rows, so nothing else would.
    const claims = claimsFor(F.tenant, "reception", F.receptionA);
    // VERBOSE IS REQUIRED, not decoration: without it Postgres 17 renders the
    // reference as `(InitPlan 6).col1` and never names the function, so the
    // assertion below would pass on ANY InitPlan.
    const lines = await asRole(sql, "authenticated", claims, async (tx) => {
      const rows = (await tx.unsafe(
        "explain (analyze, verbose, timing off, costs off, summary off) select id from patients",
      )) as Record<string, string>[];
      return rows.map((r) => r["QUERY PLAN"] as string);
    });
    const plan = lines.join("\n");
    const isSetNode = (l: string) => /Output:\s*viewer_visible_patient_ids\(\)/.test(l);

    // ONE evaluation of the set, in an InitPlan, and that node ran exactly once.
    expect(lines.filter(isSetNode), `the set is not an InitPlan:\n${plan}`).toHaveLength(1);
    const at = lines.findIndex(isSetNode);
    expect(at).toBeGreaterThan(1);
    expect(lines[at - 1], plan).toMatch(/\(actual rows=1 loops=1\)/);
    expect(lines[at - 2], plan).toMatch(/InitPlan/);

    // And nothing in the plan calls a correlated LOCATION helper any more. The
    // therapist branch's correlated call is a different function and stays.
    expect(plan).not.toContain("patient_appt_at_viewer_location");
    expect(plan).not.toContain("location_in_viewer_scope");
  });

  it("SCOPE GUARD: everything SR-33 excluded is untouched", async () => {
    // appointments_rls: 0071's shape, correlated helper still unwrapped, and no
    // trace of 0073's set anywhere in it.
    const appts = await policyExpr(sql, "appointments_rls");
    expect(appts).toMatch(/SELECT\s+viewer_has_location_assignment/i);
    expect(appts).toContain("location_in_viewer_scope");
    expect(appts).not.toMatch(/SELECT\s+location_in_viewer_scope/i);
    expect(appts).not.toContain("viewer_visible_patient_ids");

    // The write policies keep BOTH correlated calls and the UNWRAPPED nullary
    // call: PERF-05 carries them, SR-27 releases them as one batch for 0074,
    // and 0073 must not have taken them early.
    for (const name of ["patients_update", "patients_delete"]) {
      const expr = await policyExpr(sql, name);
      expect(expr).toContain("patient_appt_at_viewer_location");
      expect(expr).toContain("location_in_viewer_scope");
      expect(expr).not.toContain("viewer_visible_patient_ids");
    }
  });

  /* ================================================================== */
  /* SET EQUALITY, PER PRINCIPAL                                         */
  /* ================================================================== */

  const principals: { name: string; claims: () => string }[] = [
    { name: "owner", claims: () => claimsFor(F.tenant, "owner", F.ownerU) },
    { name: "admin assigned to LocA", claims: () => claimsFor(F.tenant, "admin", F.adminA) },
    {
      name: "admin with NO assignment",
      claims: () => claimsFor(F.tenant, "admin", F.adminUnassigned),
    },
    {
      name: "reception assigned to LocA",
      claims: () => claimsFor(F.tenant, "reception", F.receptionA),
    },
    { name: "therapist T", claims: () => claimsFor(F.tenant, "therapist", F.therapistT) },
    {
      name: "a CROSS-TENANT admin",
      claims: () => claimsFor(F.otherTenant, "admin", F.outsider),
    },
  ];

  for (const p of principals) {
    it(`patients: identical ORDERED id list for ${p.name}`, async () => {
      const after = await afterPatients(sql, p.claims());
      const before = await beforePatients(sql, p.claims());
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
    // THE patient_2_id ARM: reachable only as the secondary participant.
    expect(adminA).toContain(F.pSecondaryA);
    // THE primary_location_id ARM: LocB is not the LocA admin's.
    expect(adminA).not.toContain(F.pFallbackB);
  });

  it("a LocB-assigned reader would see the primary_location_id patient (the third arm is live)", async () => {
    // Proves the third arm of the set is not dead code: the same principal that
    // cannot see pFallbackB from LocA sees it from LocB.
    await sql`insert into staff_locations (tenant_id, user_id, location_id)
              values (${F.tenant}, ${F.adminA}, ${F.locB})`;
    try {
      const set = await afterPatients(sql, claimsFor(F.tenant, "admin", F.adminA));
      expect(set).toContain(F.pFallbackB);
      expect(set).toContain(F.pB);
    } finally {
      await sql`delete from staff_locations
                 where tenant_id = ${F.tenant} and user_id = ${F.adminA} and location_id = ${F.locB}`;
    }
  });

  it("the unassigned-admin branch still returns the whole tenant", async () => {
    const unassigned = await afterPatients(sql, claimsFor(F.tenant, "admin", F.adminUnassigned));
    for (const id of [F.pA, F.pB, F.pSecondaryA, F.pFallbackB, F.pNowhere]) {
      expect(unassigned).toContain(id);
    }
  });

  it("a CROSS-TENANT principal sees none of this fixture, under either predicate", async () => {
    const claims = claimsFor(F.otherTenant, "admin", F.outsider);
    const after = await afterPatients(sql, claims);
    const before = await beforePatients(sql, claims);
    const fixturePatients = [F.pA, F.pB, F.pSecondaryA, F.pFallbackB, F.pNowhere] as string[];
    for (const id of fixturePatients) {
      expect(after).not.toContain(id);
      expect(before).not.toContain(id);
    }
  });
});
