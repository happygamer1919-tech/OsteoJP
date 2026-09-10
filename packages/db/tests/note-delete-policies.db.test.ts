/**
 * note-delete-policies.db.test.ts — migration 0084.
 *
 * ==========================================================================
 * WHAT THE CLINIC REPORTED, AND WHAT IT ACTUALLY WAS
 * ==========================================================================
 * "There is no way to delete a patient note", and "a patient with notes cannot
 * be hard-deleted at all". Two reports, one cause: `appointment_notes` and
 * `patient_note_revisions` shipped append-only - SELECT and INSERT policies, and
 * from 0050 an UPDATE policy on the first - so a DELETE resolved to ZERO ROWS
 * for every principal. `hardDeletePatient` counts both tables among its refusal
 * classes, so a single note made a patient permanently undeletable through a
 * door that could never be opened.
 *
 * ==========================================================================
 * WHAT IS ASSERTED, AND WHY IT IS THE END STATE RATHER THAN THE CHANGE
 * ==========================================================================
 * Not "a DELETE now returns 1" alone. Three properties that a later migration,
 * a policy rename or a grant sweep could each break silently:
 *
 *   1. an in-tenant DELETE removes exactly its own row;
 *   2. a CROSS-TENANT delete removes nothing - the widening is tenant-scoped,
 *      and a policy written `USING (true)` would pass case 1 and fail this one;
 *   3. `anon` and `patient` can delete nothing, because a patient able to erase
 *      a clinic's note is the one way this migration could be dangerous.
 *
 * Every isolation assertion runs through `asRole`, never on the owner
 * connection: the owner BYPASSES RLS by ownership, so an assertion made there
 * would pass for the wrong reason.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

const d = live ? describe : describe.skip;

d("0084: a note is deletable in its own tenant and nowhere else", () => {
  let sql: Sql;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const location = randomUUID();
  const patient = randomUUID();

  /** A fresh note in each table, so every case deletes a row nobody else owns. */
  const seedNotes = async (): Promise<{ unified: string; legacy: string }> => {
    const unified = randomUUID();
    const legacy = randomUUID();
    await sql`insert into appointment_notes (id, tenant_id, patient_id, body)
              values (${unified}, ${tenant}, ${patient}, 'nota unificada')`;
    await sql`insert into patient_note_revisions (id, tenant_id, patient_id, content)
              values (${legacy}, ${tenant}, ${patient}, 'revisao legada')`;
    return { unified, legacy };
  };

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug)
              values (${tenant}, 'Notes 0084', ${"n84-" + tenant.slice(0, 8)}),
                     (${otherTenant}, 'Notes 0084 B', ${"n84b-" + otherTenant.slice(0, 8)})`;
    await sql`insert into locations (id, tenant_id, name) values (${location}, ${tenant}, 'CB')`;
    await sql`insert into patients (id, tenant_id, full_name, primary_location_id)
              values (${patient}, ${tenant}, 'Paciente 0084', ${location})`;
  });

  afterAll(async () => {
    await sql`delete from tenants where id in (${tenant}, ${otherTenant})`;
    await sql.end();
  });

  it("an in-tenant authenticated principal deletes its own note, in both relations", async () => {
    const { unified, legacy } = await seedNotes();
    const deleted = await asRole(sql, "authenticated", claimsFor(tenant, "admin"), async (tx) => {
      const a = await tx`delete from appointment_notes where id = ${unified} returning id`;
      const b = await tx`delete from patient_note_revisions where id = ${legacy} returning id`;
      return { unified: a.length, legacy: b.length };
    });
    expect(deleted).toEqual({ unified: 1, legacy: 1 });
  });

  it("a therapist principal deletes too — the finer rule is the app layer's, exactly as 0050 left the edit rule", async () => {
    const { unified } = await seedNotes();
    const n = await asRole(sql, "authenticated", claimsFor(tenant, "therapist"), async (tx) =>
      (await tx`delete from appointment_notes where id = ${unified} returning id`).length,
    );
    expect(n).toBe(1);
  });

  it("a principal of ANOTHER tenant deletes nothing — a `USING (true)` policy would fail here and only here", async () => {
    const { unified, legacy } = await seedNotes();
    const deleted = await asRole(
      sql,
      "authenticated",
      claimsFor(otherTenant, "admin"),
      async (tx) => {
        const a = await tx`delete from appointment_notes where id = ${unified} returning id`;
        const b = await tx`delete from patient_note_revisions where id = ${legacy} returning id`;
        return { unified: a.length, legacy: b.length };
      },
    );
    expect(deleted).toEqual({ unified: 0, legacy: 0 });
    // And the rows are still there, read on the owner connection.
    const still = await sql`select count(*)::int as n from appointment_notes where id = ${unified}`;
    expect(Number(still[0]!.n)).toBe(1);
  });

  it("the `patient` role deletes nothing — a patient must never be able to erase a clinic note", async () => {
    const { unified, legacy } = await seedNotes();
    const deleted = await asRole(
      sql,
      "patient",
      patientClaims(tenant, patient),
      async (tx) => {
        const a = await tx`delete from appointment_notes where id = ${unified} returning id`;
        const b = await tx`delete from patient_note_revisions where id = ${legacy} returning id`;
        return { unified: a.length, legacy: b.length };
      },
    );
    expect(deleted).toEqual({ unified: 0, legacy: 0 });
  });

  it("a principal with NO claims at all deletes nothing", async () => {
    const { unified } = await seedNotes();
    const n = await asRole(sql, "authenticated", null, async (tx) =>
      (await tx`delete from appointment_notes where id = ${unified} returning id`).length,
    );
    expect(n).toBe(0);
  });

  it("audit_log is still undeletable — this migration did not make the trail erasable", async () => {
    // The note-delete action writes an audit row in the same transaction as the
    // DELETE. That row must outlive everything, including whoever wrote it.
    const rows = await sql`select count(*)::int as n from pg_policy
                           where polrelid = to_regclass('public.audit_log') and polcmd = 'd'`;
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
