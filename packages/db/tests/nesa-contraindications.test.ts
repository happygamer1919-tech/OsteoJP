/**
 * nesa-contraindications.test.ts — migration 0031 (NESA contraindication flags).
 *
 * Proves ruling A (DECISIONS 2026-07-03) as stored by the DB: three boolean
 * flags exist and default to false, so an insert that omits them yields false
 * on every existing row and every new row (the warning is a SOFT UI concern;
 * the DB only stores state). Columns-only on existing tables — RLS/grants are
 * inherited and unchanged, so isolation is already covered by the standing
 * cross-tenant suite; no new isolation test is required here.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (dev Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in ci.yml. Runs inside a rolled-back service_role transaction;
 * nothing persists.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, connect, live } from "./rls-harness";

const p = live ? connect() : null;

afterAll(async () => {
  await p?.end();
});

describe.skipIf(!live)("0031 NESA contraindication flags — default false (live DB)", () => {
  it("patient inserted WITHOUT the flags defaults both contraindications to false", async () => {
    const row = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await tx`insert into tenants (id, name, slug)
               values (${tenant}, ${`NESA ${tenant}`}, ${`nesa-${tenant}`})`;
      const [r] = await tx<
        { contraindication_epilepsy: boolean; contraindication_pregnancy: boolean }[]
      >`insert into patients (tenant_id, full_name) values (${tenant}, 'No Flags')
        returning contraindication_epilepsy, contraindication_pregnancy`;
      return r!;
    });
    expect(row.contraindication_epilepsy).toBe(false);
    expect(row.contraindication_pregnancy).toBe(false);
  });

  it("service inserted WITHOUT the flag defaults contraindication_sensitive to false", async () => {
    const value = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await tx`insert into tenants (id, name, slug)
               values (${tenant}, ${`NESA ${tenant}`}, ${`nesa-${tenant}`})`;
      const [r] = await tx<{ contraindication_sensitive: boolean }[]>`
        insert into services (tenant_id, name) values (${tenant}, 'NESA')
        returning contraindication_sensitive`;
      return r!.contraindication_sensitive;
    });
    expect(value).toBe(false);
  });

  it("the flags are settable to true (round-trips)", async () => {
    const result = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await tx`insert into tenants (id, name, slug)
               values (${tenant}, ${`NESA ${tenant}`}, ${`nesa-${tenant}`})`;
      const [pat] = await tx<
        { contraindication_epilepsy: boolean; contraindication_pregnancy: boolean }[]
      >`insert into patients (tenant_id, full_name, contraindication_epilepsy, contraindication_pregnancy)
        values (${tenant}, 'Flagged', true, true)
        returning contraindication_epilepsy, contraindication_pregnancy`;
      const [svc] = await tx<{ contraindication_sensitive: boolean }[]>`
        insert into services (tenant_id, name, contraindication_sensitive)
        values (${tenant}, 'NESA', true) returning contraindication_sensitive`;
      return { pat: pat!, svc: svc!.contraindication_sensitive };
    });
    expect(result.pat.contraindication_epilepsy).toBe(true);
    expect(result.pat.contraindication_pregnancy).toBe(true);
    expect(result.svc).toBe(true);
  });
});
