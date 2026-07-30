/**
 * appointment-notes-nullable-rls.test.ts — DB-gated proof for W12-13 (migration
 * 0042: appointment_notes.appointment_id + author_user_id NULLABLE).
 *
 * Proves the unified-notes DDL: a PATIENT-LEVEL note (no appointment, no
 * resolvable author) is now storable and behaves under RLS — tenant-isolated,
 * INSERT allowed, and (PL-13 / migration 0050) an in-tenant UPDATE allowed +
 * stamped while DELETE stays denied (no policy). No backfill here (that is a
 * deferred owner-gated data step). Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const A = { tenant: randomUUID(), patient: randomUUID(), note: randomUUID() };
const B = { tenant: randomUUID() };

describe.skipIf(!live)("appointment_notes nullable (0042) — patient-level notes + RLS invariants", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${A.tenant}, 'Notes A', ${`notes-a-${A.tenant}`})`;
    await sql`insert into tenants (id, name, slug) values (${B.tenant}, 'Notes B', ${`notes-b-${B.tenant}`})`;
    await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
              values (${A.patient}, ${A.tenant}, 'Paciente A', ${randomUUID()}, now())`;
    // A PATIENT-LEVEL note: appointment_id NULL + author_user_id NULL (0042).
    await sql`insert into appointment_notes (id, tenant_id, patient_id, appointment_id, author_user_id, body)
              values (${A.note}, ${A.tenant}, ${A.patient}, null, null, 'nota ao nível do paciente')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: owner sees the patient-level note with both nullable cols NULL", async () => {
    const rows = await sql<{ appointment_id: string | null; author_user_id: string | null }[]>`
      select appointment_id, author_user_id from appointment_notes where id = ${A.note}`;
    expect(rows.length).toBe(1);
    expect(rows[0]!.appointment_id).toBeNull();
    expect(rows[0]!.author_user_id).toBeNull();
  });

  it("a patient-level note (NULL appointment_id + NULL author) is INSERTABLE under authenticated in-tenant", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist"), (tx) =>
      tx<{ id: string }[]>`insert into appointment_notes (tenant_id, patient_id, appointment_id, author_user_id, body)
         values (${A.tenant}, ${A.patient}, null, null, 'outra nota de paciente') returning id`,
    );
    expect(rows.length).toBe(1);
  });

  it("tenant B sees ZERO of tenant A's notes (tenant isolation holds)", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "therapist"), (tx) =>
      tx<{ id: string }[]>`select id from appointment_notes where id = ${A.note}`,
    );
    expect(rows.length).toBe(0);
  });

  it("PL-13 (0050): an in-tenant UPDATE is ALLOWED and stamps edited_at; DELETE still denied (no policy)", async () => {
    const upd = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist"), (tx) =>
      tx<{ id: string }[]>`update appointment_notes
         set body = 'nota editada', edited_at = now(), last_edited_by = null
         where id = ${A.note} returning id`,
    );
    expect(upd.length).toBe(1); // 0050 added appointment_notes_tenant_update
    const del = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist"), (tx) =>
      tx<{ id: string }[]>`delete from appointment_notes where id = ${A.note} returning id`,
    );
    expect(del.length).toBe(0); // no DELETE policy — history is preserved
  });

  it("PL-13 (0050): a CROSS-TENANT UPDATE affects 0 rows (isolation holds on the new UPDATE policy)", async () => {
    const upd = await asRole(sql, "authenticated", claimsFor(B.tenant, "therapist"), (tx) =>
      tx<{ id: string }[]>`update appointment_notes set body = 'hijack' where id = ${A.note} returning id`,
    );
    expect(upd.length).toBe(0);
  });
});
