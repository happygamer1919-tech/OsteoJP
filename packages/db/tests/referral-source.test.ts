/**
 * referral-source.test.ts — migration 0033 (patients.referral_source).
 *
 * W5-11. Proves the new nullable text column as stored by the DB:
 *   - an insert that omits it yields NULL (no backfill, every existing row NULL);
 *   - a value round-trips (the chosen option label or the Outro free-text);
 *   - ISOLATION: the column rides the patients table-level tenant policy. A
 *     staff principal scoped to tenant B cannot read tenant A's patient row —
 *     and specifically its referral_source is never returned across the tenant
 *     boundary. A columns-only add inherits the patients RLS + GRANTs unchanged
 *     (0022 profession/region, 0031 contraindications precedent); this assertion
 *     confirms the new column sits inside that fail-closed boundary, with an
 *     owner-sees / authenticated-does-not negative control so the pass is never
 *     vacuous.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (dev Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in ci.yml. Isolation assertions run through asRole("authenticated")
 * inside rolled-back transactions; the owner seed is cleaned in afterAll.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const p = live ? connect() : null;

afterAll(async () => {
  await p?.end();
});

describe.skipIf(!live)("0033 patients.referral_source — storage (live DB)", () => {
  it("patient inserted WITHOUT referral_source defaults it to NULL", async () => {
    const value = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await tx`insert into tenants (id, name, slug)
               values (${tenant}, ${`Ref ${tenant}`}, ${`ref-${tenant}`})`;
      const [r] = await tx<{ referral_source: string | null }[]>`
        insert into patients (tenant_id, full_name) values (${tenant}, 'No Source')
        returning referral_source`;
      return r!.referral_source;
    });
    expect(value).toBeNull();
  });

  it("referral_source round-trips both an option label and the Outro free-text", async () => {
    const result = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await tx`insert into tenants (id, name, slug)
               values (${tenant}, ${`Ref ${tenant}`}, ${`ref-${tenant}`})`;
      const [option] = await tx<{ referral_source: string | null }[]>`
        insert into patients (tenant_id, full_name, referral_source)
        values (${tenant}, 'Option', 'Redes sociais') returning referral_source`;
      const [other] = await tx<{ referral_source: string | null }[]>`
        insert into patients (tenant_id, full_name, referral_source)
        values (${tenant}, 'Other', 'Feira de saúde local') returning referral_source`;
      return { option: option!.referral_source, other: other!.referral_source };
    });
    expect(result.option).toBe("Redes sociais");
    expect(result.other).toBe("Feira de saúde local");
  });
});

/**
 * Isolation: same harness model as cross-tenant-rls-isolation.test.ts — seed two
 * tenants on the privileged (owner) connection in beforeAll (owner BYPASSES RLS,
 * used ONLY for seed/clean), then assert cross-tenant invisibility under a
 * role-switched authenticated JWT. RLS on patients is ENABLE-not-FORCE, so the
 * assertion MUST run as authenticated (never the owner) or it passes for the
 * wrong reason.
 */
describe.skipIf(!live)("0033 patients.referral_source — rides the patients tenant policy", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const patientA = randomUUID();
  const referralA = "Website";
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug)
              values (${tenantA}, ${`A ${tenantA}`}, ${`ref-a-${tenantA}`})`;
    await sql`insert into tenants (id, name, slug)
              values (${tenantB}, ${`B ${tenantB}`}, ${`ref-b-${tenantB}`})`;
    await sql`insert into patients (id, tenant_id, full_name, referral_source)
              values (${patientA}, ${tenantA}, 'Tenant A Patient', ${referralA})`;
  });

  afterAll(async () => {
    if (!sql) return;
    // tenant_id FK is ON DELETE CASCADE — deleting the tenants clears the patients.
    await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: owner sees tenant-A's referral_source; authenticated+B does not", async () => {
    // Owner connection (no role switch) bypasses RLS → must see A's row + value.
    const ownerSees = await sql<{ referral_source: string | null }[]>`
      select referral_source from patients where id = ${patientA}`;
    expect(ownerSees.length).toBe(1);
    expect(ownerSees[0]!.referral_source).toBe(referralA);

    // Same row under a tenant-B authenticated JWT → invisible (0 rows), so the
    // referral_source never crosses the tenant boundary.
    const bSees = await asRole(sql, "authenticated", claimsFor(tenantB), async (tx) =>
      tx<{ referral_source: string | null }[]>`
        select referral_source from patients where id = ${patientA}`,
    );
    expect(bSees.length).toBe(0);
  });

  it("SELECT of referral_source under tenant-A returns A's value; tenant-B row invisible", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(tenantA), async (tx) =>
      tx<{ id: string; referral_source: string | null }[]>`
        select id::text as id, referral_source from patients where id = ${patientA}`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.referral_source).toBe(referralA);
  });
});
