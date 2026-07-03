/**
 * patient-note-revisions.test.ts — migration 0030 (append-only patient-note history).
 *
 * Proves the JP full-version-history ruling (DECISIONS 2026-07-02) as enforced
 * by the DB, mirroring the appointment_notes (0026) / audit_log append-only
 * suite:
 *   - RLS isolation, fail-closed: a tenant cannot SELECT another tenant's
 *     revisions; a cross-tenant INSERT is rejected by WITH CHECK.
 *   - Append-only MECHANISM (not just intent): an authenticated UPDATE and
 *     DELETE of the tenant's OWN row each affect 0 rows — the POLICY pattern
 *     (no UPDATE/DELETE policy), NOT a 42501 grant throw.
 *   - Backfill correctness: running the migration's backfill INSERT...SELECT
 *     over seeded patients produces exactly one revision per patient with a
 *     non-empty note, each with content == source patients.notes and
 *     author_user_id IS NULL; empty/NULL notes produce zero revisions.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (dev Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in ci.yml. Functional cases run inside rolled-back transactions
 * (service_role BYPASSRLS for seeding/backfill; authenticated for the RLS
 * assertions); nothing persists.
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
           values (${id}, ${`PNR ${id}`}, ${`pnr-${id}`})`;
}

async function seedPatient(tx: Tx, tenant: string, name: string): Promise<string> {
  const [r] = await tx<{ id: string }[]>`
    insert into patients (tenant_id, full_name) values (${tenant}, ${name}) returning id`;
  return r!.id;
}

describe.skipIf(!live)("0030 patient_note_revisions — append-only history (live DB)", () => {
  /* ---- RLS isolation, fail-closed ------------------------------------ */
  it("SELECT under tenant-A sees A's revision; tenant-B's is invisible", async () => {
    const seen = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      const tB = randomUUID();
      await seedTenant(tx, tA);
      await seedTenant(tx, tB);
      const pA = await seedPatient(tx, tA, "Ana");
      const pB = await seedPatient(tx, tB, "Bruno");
      const [rA] = await tx<{ id: string }[]>`
        insert into patient_note_revisions (tenant_id, patient_id, content)
        values (${tA}, ${pA}, 'A note') returning id`;
      const [rB] = await tx<{ id: string }[]>`
        insert into patient_note_revisions (tenant_id, patient_id, content)
        values (${tB}, ${pB}, 'B note') returning id`;
      // Assert isolation from inside the SAME transaction, as tenant A.
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      const rows = (await tx`select id::text as id from patient_note_revisions`) as {
        id: string;
      }[];
      const ids = rows.map((r) => r.id);
      return { ids, aId: rA!.id, bId: rB!.id };
    });
    expect(seen.ids).toContain(seen.aId);
    expect(seen.ids).not.toContain(seen.bId);
  });

  it("INSERT of an own-tenant revision under tenant-A JWT succeeds", async () => {
    const inserted = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const pA = await seedPatient(tx, tA, "Ana");
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      return (await tx`insert into patient_note_revisions (tenant_id, patient_id, content)
        values (${tA}, ${pA}, 'own') returning id`) as { id: string }[];
    });
    expect(inserted.length).toBe(1);
  });

  it("INSERT of a tenant-B revision under tenant-A JWT is rejected by WITH CHECK", async () => {
    await expect(
      asRole(p!, "service_role", null, async (tx) => {
        const tA = randomUUID();
        const tB = randomUUID();
        await seedTenant(tx, tA);
        await seedTenant(tx, tB);
        const pB = await seedPatient(tx, tB, "Bruno");
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
        await tx`insert into patient_note_revisions (tenant_id, patient_id, content)
          values (${tB}, ${pB}, 'cross')`;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  /* ---- Append-only MECHANISM (POLICY pattern ⇒ 0 rows, not a throw) --- */
  it("UPDATE of the tenant's OWN revision affects 0 rows — append-only (no UPDATE policy)", async () => {
    const updated = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const pA = await seedPatient(tx, tA, "Ana");
      const [r] = await tx<{ id: string }[]>`
        insert into patient_note_revisions (tenant_id, patient_id, content)
        values (${tA}, ${pA}, 'immutable') returning id`;
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      return (await tx`update patient_note_revisions set content = 'mutated'
        where id = ${r!.id} returning id`) as { id: string }[];
    });
    expect(updated.length).toBe(0);
  });

  it("DELETE of the tenant's OWN revision affects 0 rows — append-only (no DELETE policy)", async () => {
    const deleted = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      const pA = await seedPatient(tx, tA, "Ana");
      const [r] = await tx<{ id: string }[]>`
        insert into patient_note_revisions (tenant_id, patient_id, content)
        values (${tA}, ${pA}, 'immutable') returning id`;
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(tA)}, true)`;
      return (await tx`delete from patient_note_revisions
        where id = ${r!.id} returning id`) as { id: string }[];
    });
    expect(deleted.length).toBe(0);
  });

  /* ---- Backfill correctness (the migration's INSERT...SELECT logic) --- */
  it("backfill: one revision per non-empty note, content == notes, author NULL; empty/NULL skipped", async () => {
    const result = await asRole(p!, "service_role", null, async (tx) => {
      const tA = randomUUID();
      await seedTenant(tx, tA);
      // Two non-empty notes, one whitespace-only (btrim -> empty), one NULL.
      const withNote1 = randomUUID();
      const withNote2 = randomUUID();
      await tx`insert into patients (id, tenant_id, full_name, notes) values
        (${withNote1}, ${tA}, 'Has Note 1', 'first note'),
        (${withNote2}, ${tA}, 'Has Note 2', 'second note'),
        (${randomUUID()}, ${tA}, 'Whitespace', '   '),
        (${randomUUID()}, ${tA}, 'Null Note', NULL)`;
      // Run the SAME backfill statement the migration runs, scoped to this tenant.
      await tx`insert into patient_note_revisions (tenant_id, patient_id, content, author_user_id, created_at)
        select tenant_id, id, notes, null, now()
        from patients
        where tenant_id = ${tA} and notes is not null and btrim(notes) <> ''`;
      const rows = (await tx`select patient_id::text as patient_id, content, author_user_id
        from patient_note_revisions where tenant_id = ${tA} order by content`) as {
        patient_id: string;
        content: string;
        author_user_id: string | null;
      }[];
      return { rows, withNote1, withNote2 };
    });
    // Exactly the two non-empty-note patients got a revision.
    expect(result.rows.length).toBe(2);
    expect(result.rows.map((r) => r.patient_id).sort()).toEqual(
      [result.withNote1, result.withNote2].sort(),
    );
    // content mirrors the source note; author is NULL (system backfill).
    expect(result.rows.map((r) => r.content)).toEqual(["first note", "second note"]);
    expect(result.rows.every((r) => r.author_user_id === null)).toBe(true);
  });
});
