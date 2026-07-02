/**
 * patient-number.test.ts — migration 0029 (per-tenant sequential patient number).
 *
 * Proves the JP ruling (DECISIONS 2026-07-02) as enforced by the DB:
 *   - patient_number is assigned MAX+1 PER TENANT by the 0029 BEFORE INSERT
 *     trigger when the inserted value is NULL (the safety net for the insert
 *     paths that do not set it), yielding contiguous 1..N within a tenant.
 *   - UNIQUE (tenant_id, patient_number): a within-tenant duplicate is rejected;
 *     the SAME number under a different tenant is accepted.
 *   - An EXPLICIT value passes through untouched (preserves future Fisiozero
 *     originals) and the next auto-assignment is MAX+1 above it.
 *   - Concurrent inserts into one tenant do NOT collide (advisory-lock race
 *     safety) — the constraint is the ultimate backstop.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in ci.yml. Non-concurrent cases run inside a rolled-back
 * service_role transaction (BYPASSRLS); nothing persists.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, connect, live } from "./rls-harness";

const p = live ? connect() : null;

afterAll(async () => {
  await p?.end();
});

async function seedTenant(tx: Parameters<Parameters<typeof asRole>[3]>[0], id: string) {
  await tx`insert into tenants (id, name, slug)
           values (${id}, ${`PatNum ${id}`}, ${`patnum-${id}`})`;
}

describe.skipIf(!live)("0029 patient_number — per-tenant sequential id (live DB)", () => {
  it("trigger assigns contiguous 1..N per tenant when value omitted", async () => {
    const rows = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await seedTenant(tx, tenant);
      const inserted: number[] = [];
      for (const name of ["Ana", "Bruno", "Carla"]) {
        const [r] = await tx<{ patient_number: number }[]>`
          insert into patients (tenant_id, full_name) values (${tenant}, ${name})
          returning patient_number`;
        inserted.push(r!.patient_number);
      }
      return inserted;
    });
    expect(rows).toEqual([1, 2, 3]);
  });

  it("new patient gets MAX+1 for its tenant", async () => {
    const next = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await seedTenant(tx, tenant);
      await tx`insert into patients (tenant_id, full_name) values (${tenant}, 'X'), (${tenant}, 'Y')`;
      const [r] = await tx<{ patient_number: number }[]>`
        insert into patients (tenant_id, full_name) values (${tenant}, 'Z')
        returning patient_number`;
      return r!.patient_number;
    });
    expect(next).toBe(3);
  });

  it("rejects a duplicate (tenant_id, patient_number)", async () => {
    await expect(
      asRole(p!, "service_role", null, async (tx) => {
        const tenant = randomUUID();
        await seedTenant(tx, tenant);
        await tx`insert into patients (tenant_id, full_name, patient_number)
                 values (${tenant}, 'First', 7)`;
        // Same tenant + same explicit number → unique violation (23505).
        await tx`insert into patients (tenant_id, full_name, patient_number)
                 values (${tenant}, 'Clash', 7)`;
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows the same patient_number across different tenants", async () => {
    const [a, b] = await asRole(p!, "service_role", null, async (tx) => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      await seedTenant(tx, tenantA);
      await seedTenant(tx, tenantB);
      const [ra] = await tx<{ patient_number: number }[]>`
        insert into patients (tenant_id, full_name, patient_number)
        values (${tenantA}, 'A1', 1) returning patient_number`;
      const [rb] = await tx<{ patient_number: number }[]>`
        insert into patients (tenant_id, full_name, patient_number)
        values (${tenantB}, 'B1', 1) returning patient_number`;
      return [ra!.patient_number, rb!.patient_number];
    });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("passes an explicit value through untouched; next auto-assign is MAX+1 above it", async () => {
    const [explicit, next] = await asRole(p!, "service_role", null, async (tx) => {
      const tenant = randomUUID();
      await seedTenant(tx, tenant);
      // Simulates a Fisiozero import keeping its original number.
      const [e] = await tx<{ patient_number: number }[]>`
        insert into patients (tenant_id, full_name, patient_number)
        values (${tenant}, 'Original 500', 500) returning patient_number`;
      const [n] = await tx<{ patient_number: number }[]>`
        insert into patients (tenant_id, full_name) values (${tenant}, 'Auto')
        returning patient_number`;
      return [e!.patient_number, n!.patient_number];
    });
    expect(explicit).toBe(500);
    expect(next).toBe(501);
  });

  it("concurrent inserts into one tenant do not collide (advisory-lock race safety)", async () => {
    const tenant = randomUUID();
    const c1 = connect();
    const c2 = connect();
    try {
      await p!`insert into tenants (id, name, slug)
               values (${tenant}, ${`PatNum ${tenant}`}, ${`patnum-${tenant}`})`;
      const insert = (c: ReturnType<typeof connect>) =>
        c<{ patient_number: number }[]>`
          insert into patients (tenant_id, full_name) values (${tenant}, 'Race')
          returning patient_number`.then((r) => r[0]!.patient_number);
      const [n1, n2] = await Promise.all([insert(c1), insert(c2)]);
      expect(new Set([n1, n2]).size).toBe(2);
      expect([n1, n2].sort()).toEqual([1, 2]);
    } finally {
      await p!`delete from patients where tenant_id = ${tenant}`;
      await p!`delete from tenants where id = ${tenant}`;
      await c1.end();
      await c2.end();
    }
  });
});
