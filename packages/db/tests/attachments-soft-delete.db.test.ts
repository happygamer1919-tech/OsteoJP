/**
 * attachments-soft-delete.db.test.ts — packages/db/migrations/0089_attachments_soft_delete.sql.
 *
 * SR-62 PU-4. A patient document removed from the Documentos tab is SOFT
 * deleted: the row stays, and who / when / why are three columns on it. This
 * suite asserts the END STATE the migration leaves, against a real Postgres:
 *
 *   1. the three columns, the CHECK and the rewritten portal policy exist;
 *   2. the CHECK refuses every PARTIAL soft delete, and a blank reason
 *      (spaces, or tabs and newlines);
 *   3. a staff principal can write a complete soft delete through RLS;
 *   4. the PATIENT role cannot see a soft-deleted row of their own, while a
 *      live row of theirs stays visible (the negative control that makes the
 *      invisibility mean something);
 *   5. STAFF still see the soft-deleted row and its reason (the row is kept).
 *
 * THIS FILE IS RED UNTIL THE MIGRATION IS APPLIED. Before promotion the columns
 * do not exist in any database this suite can reach, so every case fails at the
 * first column reference. That is correct: a skip here would read as protection.
 *
 * Every visibility assertion runs through `asRole`, never on the owner
 * connection, because the owner bypasses RLS by ownership. The CHECK cases run
 * on the owner connection on purpose: a CHECK binds every role, including the
 * ones RLS does not, so the strongest proof is the role that bypasses RLS.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

const CHECK = "attachments_soft_delete_complete";
const REASON = "Carregado no paciente errado (teste 0088+1)";

describe.skipIf(!live)("0089: attachments soft delete", () => {
  let sql: Sql;

  const tenant = randomUUID();
  const role = randomUUID();
  const user = randomUUID();
  const location = randomUUID();
  const patient = randomUUID();
  const liveDoc = randomUUID();
  const deletedDoc = randomUUID();
  const target = randomUUID();

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug)
              values (${tenant}, 'Soft delete 0088+1', ${"sd-" + tenant.slice(0, 8)})`;
    await sql`insert into roles (id, tenant_id, slug, name)
              values (${role}, ${tenant}, 'reception', 'Reception')`;
    await sql`insert into users (id, tenant_id, role_id, email, full_name)
              values (${user}, ${tenant}, ${role}, ${`sd-${user}@example.pt`}, 'Rececao Teste')`;
    await sql`insert into locations (id, tenant_id, name) values (${location}, ${tenant}, 'LV')`;
    await sql`insert into patients (id, tenant_id, full_name, primary_location_id)
              values (${patient}, ${tenant}, 'Paciente Soft Delete', ${location})`;
    await sql`insert into attachments (id, tenant_id, patient_id, storage_path, file_name)
              values (${liveDoc}, ${tenant}, ${patient}, ${`${tenant}/patient-documents/${patient}/live.pdf`}, 'live.pdf'),
                     (${target}, ${tenant}, ${patient}, ${`${tenant}/patient-documents/${patient}/target.pdf`}, 'target.pdf')`;
    await sql`insert into attachments
                (id, tenant_id, patient_id, storage_path, file_name, deleted_at, deleted_by_user_id, delete_reason)
              values (${deletedDoc}, ${tenant}, ${patient}, ${`${tenant}/patient-documents/${patient}/gone.pdf`},
                      'gone.pdf', now(), ${user}, ${REASON})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from attachments where tenant_id = ${tenant}`;
    await sql`delete from tenants where id = ${tenant}`;
    await sql.end();
  });

  it("the columns, the CHECK and the portal policy are what the migration authored", async () => {
    const cols = (await sql`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'attachments'
        and column_name in ('deleted_at', 'deleted_by_user_id', 'delete_reason')
      order by column_name`) as { column_name: string; data_type: string; is_nullable: string }[];
    expect(cols).toEqual([
      { column_name: "delete_reason", data_type: "text", is_nullable: "YES" },
      { column_name: "deleted_at", data_type: "timestamp with time zone", is_nullable: "YES" },
      { column_name: "deleted_by_user_id", data_type: "uuid", is_nullable: "YES" },
    ]);

    const check = await sql`select 1 from pg_constraint
                            where conrelid = 'public.attachments'::regclass and conname = ${CHECK} and contype = 'c'`;
    expect(check).toHaveLength(1);

    const policy = (await sql`
      select cmd, roles::text[] as roles, qual
      from pg_policies
      where schemaname = 'public' and tablename = 'attachments'
        and policyname = 'attachments_patient_selfscope'`) as { cmd: string; roles: string[]; qual: string }[];
    expect(policy).toHaveLength(1);
    expect(policy[0]!.cmd).toBe("SELECT");
    expect(policy[0]!.roles).toEqual(["patient"]);
    expect(policy[0]!.qual).toContain("jwt_patient_id()");
    expect(policy[0]!.qual).toContain("jwt_tenant_id()");
    expect(policy[0]!.qual).toMatch(/deleted_at IS NULL/i);
  });

  it.each([
    ["deleted_at alone", { at: true, by: false, reason: null }],
    ["deleted_at and actor, no reason", { at: true, by: true, reason: null }],
    ["deleted_at and reason, no actor", { at: true, by: false, reason: REASON }],
    ["actor and reason, no deleted_at", { at: false, by: true, reason: REASON }],
    ["reason alone", { at: false, by: false, reason: REASON }],
  ])("the CHECK refuses a PARTIAL soft delete: %s", async (_label, c) => {
    await expect(
      sql`update attachments
          set deleted_at = ${c.at ? sql`now()` : null},
              deleted_by_user_id = ${c.by ? user : null},
              delete_reason = ${c.reason}
          where id = ${target}`,
    ).rejects.toMatchObject({ code: "23514", constraint_name: CHECK });
  });

  it.each([
    ["empty", ""],
    ["spaces", "    "],
    ["tabs and newlines", "\t\n \r\n"],
  ])("the CHECK refuses a blank reason: %s", async (_label, reason) => {
    await expect(
      sql`update attachments
          set deleted_at = now(), deleted_by_user_id = ${user}, delete_reason = ${reason}
          where id = ${target}`,
    ).rejects.toMatchObject({ code: "23514", constraint_name: CHECK });
  });

  it("after every refusal above, the target row is still live (nothing half-written)", async () => {
    const [row] = (await sql`select deleted_at, deleted_by_user_id, delete_reason
                             from attachments where id = ${target}`) as {
      deleted_at: Date | null;
      deleted_by_user_id: string | null;
      delete_reason: string | null;
    }[];
    expect(row).toEqual({ deleted_at: null, deleted_by_user_id: null, delete_reason: null });
  });

  it("a staff principal writes a COMPLETE soft delete through RLS (rolled back)", async () => {
    const updated = await asRole(sql, "authenticated", claimsFor(tenant, "reception", user), async (tx) =>
      tx`update attachments
         set deleted_at = now(), deleted_by_user_id = ${user}, delete_reason = ${REASON}
         where id = ${target} and deleted_at is null
         returning id`,
    );
    expect(updated).toHaveLength(1);
  });

  it("the PATIENT sees their live document and NOT their soft-deleted one", async () => {
    const ids = await asRole(sql, "patient", patientClaims(tenant, patient), async (tx) =>
      ((await tx`select id::text as id from attachments
                 where id in (${liveDoc}, ${deletedDoc}) order by id`) as { id: string }[]).map((r) => r.id),
    );
    // The negative control first: the live row IS visible, so an empty result
    // below could not be a broken claim or a missing grant.
    expect(ids).toContain(liveDoc);
    expect(ids).not.toContain(deletedDoc);
  });

  it("the patient cannot reach the soft-deleted row by id either", async () => {
    const rows = await asRole(sql, "patient", patientClaims(tenant, patient), async (tx) =>
      tx`select id from attachments where id = ${deletedDoc}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("STAFF still see the soft-deleted row, with who and why: the row is kept", async () => {
    const rows = (await asRole(sql, "authenticated", claimsFor(tenant, "reception", user), async (tx) =>
      tx`select deleted_by_user_id::text as by, delete_reason, deleted_at is not null as deleted
         from attachments where id = ${deletedDoc}`,
    )) as { by: string; delete_reason: string; deleted: boolean }[];
    expect(rows).toEqual([{ by: user, delete_reason: REASON, deleted: true }]);
  });
});
