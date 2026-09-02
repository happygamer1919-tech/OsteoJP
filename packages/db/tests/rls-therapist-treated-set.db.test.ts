/**
 * MIGRATION 0074 PART B — PERF-12. The therapist branch of patients_select
 * resolves its set ONCE per statement, and the visible SET is unchanged.
 *
 * ==========================================================================
 * THE SAME TWO HALVES 0073 NEEDED, AND FOR THE SAME REASON
 * ==========================================================================
 * The old and the new predicate select the same rows by construction, so a
 * suite that only compared visibility would stay GREEN if somebody put the
 * correlated helper back. Both halves are asserted:
 *
 *   SAME ROWS   ordered id lists hashed with md5, six principals including a
 *               CROSS-TENANT one, before and after, in one database. The BEFORE
 *               is 0073's predicate transcribed inline and run on the owner
 *               connection, which bypasses RLS.
 *   ONCE        the set appears as an InitPlan at loops=1 in a VERBOSE EXPLAIN,
 *               and patient_appt_treated_by_viewer does not appear in the plan.
 *
 * THE SCOPE GUARD IS THE THIRD THING, and SR-35 named it: the correlated helper
 * is NOT dropped. It still serves patients_update and patients_delete, which
 * 0074 does not touch, and this file asserts it is still there and still
 * unwrapped. A migration that over-reached would redden here rather than pass
 * for looking faster.
 *
 * GATING: needs a live privileged DATABASE_URL with 0074 applied.
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
  receptionA: randomUUID(),
  therapistT: randomUUID(),
  otherT: randomUUID(),
  outsider: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  pTreated: randomUUID(),
  pTreatedSecond: randomUUID(),
  pAsSecondary: randomUUID(),
  pOtherTherapist: randomUUID(),
  pNowhere: randomUUID(),
};

const T0 = "2026-05-06T09:00:00Z";
const T1 = "2026-05-06T10:00:00Z";
const T2 = "2026-05-07T09:00:00Z";
const T3 = "2026-05-07T10:00:00Z";
const T4 = "2026-05-08T09:00:00Z";
const T5 = "2026-05-08T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values
    (${F.tenant},      'W0074',     ${`w0074-${F.tenant}`}),
    (${F.otherTenant}, 'W0074 out', ${`w0074o-${F.otherTenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${F.ownerU},     ${F.tenant}, ${`o-${F.ownerU}@x.pt`},  'Owner'),
    (${F.adminA},     ${F.tenant}, ${`a-${F.adminA}@x.pt`},  'Admin A'),
    (${F.receptionA}, ${F.tenant}, ${`r-${F.receptionA}@x.pt`}, 'Reception A'),
    (${F.therapistT}, ${F.tenant}, ${`t-${F.therapistT}@x.pt`}, 'Therapist T'),
    (${F.otherT},     ${F.tenant}, ${`x-${F.otherT}@x.pt`},  'Other T'),
    (${F.outsider},   ${F.otherTenant}, ${`z-${F.outsider}@x.pt`}, 'Outsider')`;
  await p`insert into locations (id, tenant_id, name) values
    (${F.locA}, ${F.tenant}, 'Loc A'), (${F.locB}, ${F.tenant}, 'Loc B')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${F.tenant}, ${F.adminA},     ${F.locA}),
    (${F.tenant}, ${F.receptionA}, ${F.locA})`;
  await p`insert into patients (id, tenant_id, full_name) values
    (${F.pTreated},        ${F.tenant}, 'P Treated'),
    (${F.pTreatedSecond},  ${F.tenant}, 'P Treated Second'),
    (${F.pAsSecondary},    ${F.tenant}, 'P As Secondary'),
    (${F.pOtherTherapist}, ${F.tenant}, 'P Other Therapist'),
    (${F.pNowhere},        ${F.tenant}, 'P Nowhere')`;

  // The therapist is the PRIMARY practitioner here.
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${F.tenant}, ${F.pTreated}, ${F.therapistT}, ${F.locA}, ${T0}, ${T1})`;
  // ... and the SECOND practitioner here. A set that read only practitioner_id
  // would narrow what a therapist sees, so this row is the one that catches it.
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at)
          values (${F.tenant}, ${F.pTreatedSecond}, ${F.otherT}, ${F.therapistT}, ${F.locB}, ${T2}, ${T3})`;
  // ... and the patient reachable only as patient_2_id on the therapist's own
  // appointment, which catches the other half of the same mistake.
  await p`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id, starts_at, ends_at)
          values (${F.tenant}, ${F.pTreated}, ${F.pAsSecondary}, ${F.therapistT}, ${F.locA}, ${T4}, ${T5})`;
  // Another therapist's patient, which must stay invisible.
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${F.tenant}, ${F.pOtherTherapist}, ${F.otherT}, ${F.locB}, ${T0}, ${T1})`;
}

const md5 = (ids: string[]) => createHash("md5").update(ids.join(",")).digest("hex");

async function afterPatients(sql: Sql, claims: string): Promise<string[]> {
  return asRole(sql, "authenticated", claims, async (tx) =>
    ((await tx`select id::text as id from patients order by id`) as { id: string }[]).map((r) => r.id),
  );
}

/** 0073's patients_select, transcribed, on the owner connection where RLS does not apply. */
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
               or id = ANY (coalesce((select public.viewer_visible_patient_ids()), '{}'::uuid[]))
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

async function policyExpr(sql: Sql, name: string): Promise<string> {
  const [row] = (await sql`
    select pg_get_expr(polqual, polrelid) as expr from pg_policy where polname = ${name}`) as {
    expr: string;
  }[];
  expect(row, `no policy named ${name}`).toBeDefined();
  return row!.expr;
}

describe.skipIf(!live)("0074 part B: the therapist set is resolved once, and sees the same rows", () => {
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

  /* ---------------- the helper, as declared ---------------- */

  it("viewer_treated_patient_ids is nullary, STABLE, SECURITY DEFINER, owned by postgres", async () => {
    const [row] = (await sql`
      select p.pronargs, p.provolatile, p.prosecdef, r.rolname as owner, p.proacl is not null as has_acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        join pg_roles r on r.oid = p.proowner
       where n.nspname = 'public' and p.proname = 'viewer_treated_patient_ids'`) as {
      pronargs: number;
      provolatile: string;
      prosecdef: boolean;
      owner: string;
      has_acl: boolean;
    }[];
    expect(row).toBeDefined();
    expect(row!.pronargs).toBe(0);
    expect(row!.provolatile).toBe("s");
    expect(row!.prosecdef).toBe(true);
    expect(row!.owner).toBe("postgres");
    expect(row!.has_acl).toBe(true);
  });

  it("is EXECUTE-able by authenticated only, not anon, not patient, not PUBLIC", async () => {
    const rows = (await sql`
      select coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
       where n.nspname = 'public' and p.proname = 'viewer_treated_patient_ids'
         and a.privilege_type = 'EXECUTE'`) as { grantee: string }[];
    const g = rows.map((r) => r.grantee);
    expect(g).toContain("authenticated");
    expect(g).not.toContain("anon");
    expect(g).not.toContain("patient");
    expect(g).not.toContain("PUBLIC");
  });

  it("returns an empty array, never NULL, for a therapist who has treated nobody", async () => {
    const claims = claimsFor(F.tenant, "therapist", F.outsider);
    const [row] = (await asRole(sql, "authenticated", claims, async (tx) =>
      tx`select public.viewer_treated_patient_ids() as ids`,
    )) as { ids: string[] }[];
    expect(row!.ids).toEqual([]);
  });

  /* ---------------- the evaluation-count arm ---------------- */

  it("patients_select tests SET MEMBERSHIP, and the correlated call is gone from it", async () => {
    const expr = await policyExpr(sql, "patients_select");
    expect(expr).toMatch(/SELECT\s+viewer_treated_patient_ids/i);
    expect(expr).not.toContain("patient_appt_treated_by_viewer");
    // 0073's work is untouched.
    expect(expr).toMatch(/SELECT\s+viewer_visible_patient_ids/i);
    expect(expr).toMatch(/SELECT\s+viewer_has_location_assignment/i);
  });

  it("THE TIMING ASSERTION: the therapist set is computed ONCE per statement", async () => {
    const claims = claimsFor(F.tenant, "therapist", F.therapistT);
    const lines = await asRole(sql, "authenticated", claims, async (tx) => {
      const rows = (await tx.unsafe(
        "explain (analyze, verbose, timing off, costs off, summary off) select id from patients",
      )) as Record<string, string>[];
      return rows.map((r) => r["QUERY PLAN"] as string);
    });
    const plan = lines.join("\n");
    const isSetNode = (l: string) => /Output:\s*viewer_treated_patient_ids\(\)/.test(l);
    expect(lines.filter(isSetNode), `the set is not an InitPlan:\n${plan}`).toHaveLength(1);
    const at = lines.findIndex(isSetNode);
    expect(lines[at - 1], plan).toMatch(/\(actual rows=1 loops=1\)/);
    expect(lines[at - 2], plan).toMatch(/InitPlan/);
    expect(plan).not.toContain("patient_appt_treated_by_viewer");
  });

  it("SCOPE GUARD: the correlated helper is NOT dropped, and stays unwrapped on the write path", async () => {
    for (const name of ["patients_update", "patients_delete"]) {
      const expr = await policyExpr(sql, name);
      expect(expr).toContain("patient_appt_treated_by_viewer");
      expect(expr).not.toMatch(/SELECT\s+patient_appt_treated_by_viewer/i);
      // 0074 must not have taken SR-27's batch early either.
      expect(expr).toContain("viewer_has_location_assignment");
      expect(expr).not.toMatch(/SELECT\s+viewer_has_location_assignment/i);
    }
  });

  /* ---------------- set equality, per principal ---------------- */

  const principals: { name: string; claims: () => string }[] = [
    { name: "owner", claims: () => claimsFor(F.tenant, "owner", F.ownerU) },
    { name: "admin assigned to LocA", claims: () => claimsFor(F.tenant, "admin", F.adminA) },
    { name: "admin with NO assignment", claims: () => claimsFor(F.tenant, "admin", F.otherT) },
    { name: "reception assigned to LocA", claims: () => claimsFor(F.tenant, "reception", F.receptionA) },
    { name: "therapist T", claims: () => claimsFor(F.tenant, "therapist", F.therapistT) },
    { name: "a CROSS-TENANT admin", claims: () => claimsFor(F.otherTenant, "admin", F.outsider) },
  ];

  for (const p of principals) {
    it(`patients: identical ORDERED id list for ${p.name}`, async () => {
      const after = await afterPatients(sql, p.claims());
      const before = await beforePatients(sql, p.claims());
      expect(after).toEqual(before);
      expect(md5(after)).toBe(md5(before));
    });
  }

  /* ---------------- anti-vacuity ---------------- */

  it("the therapist's set is the right SHAPE, not merely equal to itself", async () => {
    const t = await afterPatients(sql, claimsFor(F.tenant, "therapist", F.therapistT));
    // Treated as primary practitioner.
    expect(t).toContain(F.pTreated);
    // Treated as SECOND practitioner - the arm a practitioner_id-only set drops.
    expect(t).toContain(F.pTreatedSecond);
    // Reachable only as patient_2_id - the arm a patient_id-only set drops.
    expect(t).toContain(F.pAsSecondary);
    // Another therapist's patient, and a patient with no appointment at all.
    expect(t).not.toContain(F.pOtherTherapist);
    expect(t).not.toContain(F.pNowhere);
  });

  it("a CROSS-TENANT principal sees none of this fixture", async () => {
    const ids = await afterPatients(sql, claimsFor(F.otherTenant, "admin", F.outsider));
    for (const id of [F.pTreated, F.pTreatedSecond, F.pAsSecondary, F.pOtherTherapist, F.pNowhere]) {
      expect(ids).not.toContain(id);
    }
  });
});
