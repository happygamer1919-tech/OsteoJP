/**
 * patient-form-intake-rls.test.ts
 *
 * Adversarial DB-level proof of the Wave B patient form intake boundary
 * (migration 0011, patient_form_submissions). Complements the app-layer unit
 * tests in apps/api with the guarantees only RLS can enforce:
 *
 *   1. SELF-SCOPE SELECT — patient A1 sees only their OWN submissions, never
 *      A2's (same tenant) and never tenant-B's.
 *   2. SELF-SCOPE INSERT — A1 may submit AS THEMSELVES (succeeds), but cannot
 *      insert a row for another patient (WITH CHECK) or cross-tenant.
 *   3. NO SELF-FINALIZE — A1 cannot insert a submission in a finalized review
 *      state (WITH CHECK pins it to 'pending_review'); the review/finalize path
 *      is staff-only, a future wave.
 *   4. IMMUTABLE — the patient role has no UPDATE/DELETE grant.
 *
 * Reuses rls-harness.ts (owner connection seeds/cleans; every assertion runs
 * through asRole(..., "patient", ...) in a rolled-back tx). GATING: needs a live
 * privileged DATABASE_URL with migrations applied; skipped in CI without a DB.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, connect, live, patientClaims } from "./rls-harness";

// The patient-role policies call public.jwt_patient_id() → auth.jwt(), which
// needs the `patient` role to have USAGE on the gotrue-owned `auth` schema
// (granted by migration 0010). Under a local `supabase db reset` that grant is a
// silent no-op (migrations run as the non-privileged `postgres`, which lacks
// GRANT OPTION on `auth`); on a real Supabase branch it applies privileged and
// sticks. Probe once: if the patient role can't reach `auth`, SKIP cleanly
// rather than fail on an environment limitation (Wave A's patient self-scope
// test hits the same quirk). The boundary still runs wherever the grant holds.
let authReachable = false;
if (live) {
  const probe = connect();
  try {
    const r = await probe<{ ok: boolean }[]>`
      select has_schema_privilege('patient', 'auth', 'USAGE') as ok`;
    authReachable = r[0]?.ok === true;
  } catch {
    authReachable = false;
  } finally {
    await probe.end();
  }
  if (!authReachable) {
    // eslint-disable-next-line no-console
    console.warn(
      "[patient-form-intake-rls] SKIPPED: `patient` role lacks USAGE on schema " +
        "`auth` (local supabase db reset strips migration 0010's grant). Run on a " +
        "Supabase branch to exercise the behavioral boundary.",
    );
  }
}

type T = { tenant: string; role: string; user: string; p1: string; p2: string; sub1: string; sub2: string };
const mk = (): T => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  p1: randomUUID(),
  p2: randomUUID(),
  sub1: randomUUID(),
  sub2: randomUUID(),
});
const A = mk();
const B = mk();

async function seed(p: Sql, t: T, label: string): Promise<void> {
  await p`insert into tenants (id, name, slug) values (${t.tenant}, ${`Intake ${label}`}, ${`intake-${label}-${t.tenant}`})`;
  await p`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
          values (${t.p1}, ${t.tenant}, 'P1', ${randomUUID()}, now()),
                 (${t.p2}, ${t.tenant}, 'P2', ${randomUUID()}, now())`;
  // Pre-seed one submission per patient (owner bypasses RLS) for SELECT scoping.
  await p`insert into patient_form_submissions (id, tenant_id, patient_id, form_key, source)
          values (${t.sub1}, ${t.tenant}, ${t.p1}, 'ficha_geral', 'patient'),
                 (${t.sub2}, ${t.tenant}, ${t.p2}, 'ficha_geral', 'patient')`;
}

describe.skipIf(!live || !authReachable)("patient_form_submissions RLS — intake boundary", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = connect();
    await seed(sql, A, "A");
    await seed(sql, B, "B");
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  const asA1 = <R>(fn: Parameters<typeof asRole<R>>[3]) =>
    asRole(sql, "patient", patientClaims(A.tenant, A.p1), fn);

  it("NEGATIVE CONTROL: owner sees A2 + B1 submissions", async () => {
    const rows = await sql<{ id: string }[]>`
      select id from patient_form_submissions where id in (${A.sub2}, ${B.sub1})`;
    expect(rows.length).toBe(2);
  });

  it("A1 SELECT returns ONLY their own submission", async () => {
    const rows = await asA1((tx) => tx<{ id: string }[]>`select id from patient_form_submissions`);
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual([A.sub1]);
    expect(ids).not.toContain(A.sub2); // same tenant, other patient
    expect(ids).not.toContain(B.sub1); // cross-tenant
  });

  it("A1 may INSERT a submission AS THEMSELVES in the initial state", async () => {
    const out = await asA1(async (tx) => {
      const r = await tx<{ id: string }[]>`
        insert into patient_form_submissions (tenant_id, patient_id, form_key, source)
        values (${A.tenant}, ${A.p1}, 'ficha_geral', 'patient')
        returning id`;
      return r[0]?.id;
    });
    expect(out).toBeTruthy(); // committed-then-rolled-back inside the harness
  });

  it("A1 CANNOT insert a submission for another patient (WITH CHECK)", async () => {
    await expect(
      asA1(
        (tx) => tx`insert into patient_form_submissions (tenant_id, patient_id, form_key, source)
                   values (${A.tenant}, ${A.p2}, 'ficha_geral', 'patient')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("A1 CANNOT insert cross-tenant", async () => {
    await expect(
      asA1(
        (tx) => tx`insert into patient_form_submissions (tenant_id, patient_id, form_key, source)
                   values (${B.tenant}, ${A.p1}, 'ficha_geral', 'patient')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("A1 CANNOT self-finalize: inserting a non-initial review_state is denied", async () => {
    await expect(
      asA1(
        (tx) => tx`insert into patient_form_submissions
                     (tenant_id, patient_id, form_key, source, review_state)
                   values (${A.tenant}, ${A.p1}, 'ficha_geral', 'patient', 'approved')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("the submission is IMMUTABLE to the patient (no UPDATE/DELETE grant)", async () => {
    await expect(
      asA1((tx) => tx`update patient_form_submissions set form_key = 'x' where id = ${A.sub1}`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asA1((tx) => tx`delete from patient_form_submissions where id = ${A.sub1}`),
    ).rejects.toThrow(/permission denied/i);
  });
});
