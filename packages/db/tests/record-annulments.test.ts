/**
 * record-annulments.test.ts — migration 0035 (append-only ficha annulments, W5-30).
 *
 * Proves the "Anular" fact is enforced by the DB, mirroring the
 * patient_note_revisions (0030) / appointment_notes (0026) / audit_log
 * append-only suites:
 *   - RLS isolation, fail-closed: a tenant cannot SELECT another tenant's
 *     annulments; a cross-tenant INSERT is rejected by WITH CHECK.
 *   - Append-only MECHANISM (not just intent): an authenticated UPDATE and
 *     DELETE of the tenant's OWN row each affect 0 rows — the POLICY pattern
 *     (no UPDATE/DELETE policy), so an Anular fact can never be edited or erased.
 *   - The referenced clinical_record row is never touched (annul is a separate
 *     append-only row; the immutability trigger is not involved).
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (dev Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in ci.yml. Functional cases run inside rolled-back transactions;
 * nothing persists.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const p = live ? connect() : null;

afterAll(async () => {
  await p?.end();
});

type Tx = Parameters<Parameters<typeof asRole>[3]>[0];

async function seedTenant(tx: Tx, id: string): Promise<void> {
  await tx`insert into tenants (id, name, slug)
           values (${id}, ${`RA ${id}`}, ${`ra-${id}`})`;
}

/** A signed clinical_record to annul (INSERT of status=signed is allowed; the
 *  immutability trigger only fires on UPDATE/DELETE). */
async function seedSignedRecord(tx: Tx, tenant: string): Promise<string> {
  const [pt] = await tx<{ id: string }[]>`
    insert into patients (tenant_id, full_name) values (${tenant}, ${"Ana"}) returning id`;
  const [rec] = await tx<{ id: string }[]>`
    insert into clinical_records (tenant_id, patient_id, status)
    values (${tenant}, ${pt!.id}, 'signed') returning id`;
  return rec!.id;
}

describe.skipIf(!live)("0035 record_annulments — append-only annul (live DB)", () => {
  /* ---- RLS isolation, fail-closed ------------------------------------ */
  it("SELECT under tenant-A sees A's annulment; tenant-B's is invisible", async () => {
    const seen = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      const tB = randomUUID();
      await seedTenant(tx, tA);
      await seedTenant(tx, tB);
      const recA = await seedSignedRecord(tx, tA);
      const recB = await seedSignedRecord(tx, tB);
      const [aRow] = await tx<{ id: string }[]>`
        insert into record_annulments (tenant_id, record_id) values (${tA}, ${recA}) returning id`;
      const [bRow] = await tx<{ id: string }[]>`
        insert into record_annulments (tenant_id, record_id) values (${tB}, ${recB}) returning id`;
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      const rows = (await tx`select id::text as id from record_annulments`) as { id: string }[];
      return { ids: rows.map((r) => r.id), aId: aRow!.id, bId: bRow!.id };
    });
    expect(seen.ids).toContain(seen.aId);
    expect(seen.ids).not.toContain(seen.bId);
  });

  it("INSERT of an own-tenant annulment under tenant-A JWT succeeds", async () => {
    const inserted = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const recA = await seedSignedRecord(tx, tA);
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      return (await tx`insert into record_annulments (tenant_id, record_id)
        values (${tA}, ${recA}) returning id`) as { id: string }[];
    });
    expect(inserted.length).toBe(1);
  });

  it("INSERT of a tenant-B annulment under tenant-A JWT is rejected by WITH CHECK", async () => {
    await expect(
      asRole(p!, "service_role", null, async (tx) => {
        const tA = randomUUID();
        const tB = randomUUID();
        await seedTenant(tx, tA);
        await seedTenant(tx, tB);
        const recB = await seedSignedRecord(tx, tB);
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
        await tx`insert into record_annulments (tenant_id, record_id) values (${tB}, ${recB})`;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  /* ---- Append-only MECHANISM (POLICY pattern ⇒ 0 rows, not a throw) --- */
  it("UPDATE of the tenant's OWN annulment affects 0 rows — append-only (no UPDATE policy)", async () => {
    const updated = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const recA = await seedSignedRecord(tx, tA);
      const [r] = await tx<{ id: string }[]>`
        insert into record_annulments (tenant_id, record_id, reason)
        values (${tA}, ${recA}, 'wrong patient') returning id`;
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      return (await tx`update record_annulments set reason = 'mutated'
        where id = ${r!.id} returning id`) as { id: string }[];
    });
    expect(updated.length).toBe(0);
  });

  it("DELETE of the tenant's OWN annulment affects 0 rows — append-only (no DELETE policy)", async () => {
    const deleted = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const recA = await seedSignedRecord(tx, tA);
      const [r] = await tx<{ id: string }[]>`
        insert into record_annulments (tenant_id, record_id)
        values (${tA}, ${recA}) returning id`;
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      return (await tx`delete from record_annulments where id = ${r!.id} returning id`) as {
        id: string;
      }[];
    });
    expect(deleted.length).toBe(0);
  });

  /* ---- The signed record row is never touched by an annul --------------- */
  it("annulling leaves the referenced clinical_record row byte-for-byte unchanged", async () => {
    const res = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const recA = await seedSignedRecord(tx, tA);
      const [before] = await tx<{ status: string; updated_at: string }[]>`
        select status, updated_at::text as updated_at from clinical_records where id = ${recA}`;
      await tx`insert into record_annulments (tenant_id, record_id) values (${tA}, ${recA})`;
      const [after] = await tx<{ status: string; updated_at: string }[]>`
        select status, updated_at::text as updated_at from clinical_records where id = ${recA}`;
      return { before, after };
    });
    expect(res.after?.status).toBe("signed");
    expect(res.after).toEqual(res.before);
  });
});
