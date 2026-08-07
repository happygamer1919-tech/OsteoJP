/**
 * patient-terms-acceptances-rls.test.ts — LOOP 5 (W13-05), migration 0058.
 *
 * The isolation test CLAUDE.md rule 2 requires in the same PR as the migration
 * that adds the table. It asserts the four things the table's legal value rests
 * on, and each one is asserted against the DATABASE rather than against the
 * server action that is supposed to respect it:
 *
 *   1. TENANT ISOLATION — one tenant never sees another's acceptances.
 *   2. `recorded_by` IS PINNED to auth.uid(). It is the one field a caller could
 *      lie about and the field the record's whole evidential value rests on.
 *   3. APPEND-ONLY — UPDATE and DELETE are refused. A legal record that
 *      application code can rewrite is not a legal record.
 *   4. A well-formed insert actually works, so 1-3 are not passing because
 *      everything is refused.
 *
 * CORRECTNESS. RLS on these tables is ENABLE, not FORCE, so it applies to the
 * `authenticated` role but not to the owner connection. Every assertion runs
 * through asRole("authenticated", ...), never on the owner, which would pass for
 * the wrong reason. asRole always rolls back. The negative control below makes a
 * vacuous pass impossible: if RLS were silently off, it would fail and take the
 * rest of the suite's meaning with it.
 *
 * GATING: requires a live privileged DATABASE_URL with migrations applied.
 * Skipped without one, identical to every other packages/db suite.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  patient: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  patient: randomUUID(),
});

const A = newIds();
const B = newIds();

const ACCEPTED_AT = "2026-05-04T09:00:00Z";
const VERSION = "termos-v1";

async function seed(sql: Sql, x: Ids, label: string): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, ${label}, ${`terms-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'admin', 'Admin')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role},
                    ${`t-${x.user}@example.pt`}, 'Seed Staff')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
}

type Tx = Parameters<Parameters<typeof asRole>[3]>[0];

/** Insert one acceptance, with every field explicit so a test can bend one. */
function insertAcceptance(
  tx: Tx,
  x: Ids,
  over: { recordedBy?: string; tenant?: string } = {},
) {
  return tx`
    insert into patient_terms_acceptances
      (tenant_id, patient_id, accepted_at, terms_version, recorded_by)
    values
      (${over.tenant ?? x.tenant}, ${x.patient}, ${ACCEPTED_AT}, ${VERSION},
       ${over.recordedBy ?? x.user})
    returning id`;
}

describe.skipIf(!live)("0058 — patient_terms_acceptances is isolated and append-only", () => {
  let sql: Sql;
  let seededRow = "";

  beforeAll(async () => {
    sql = connect();
    await seed(sql, A, "Terms A");
    await seed(sql, B, "Terms B");
    // Owner-seeded so it survives the rolled-back assertion transactions.
    const rows = await sql`
      insert into patient_terms_acceptances
        (tenant_id, patient_id, accepted_at, terms_version, recorded_by)
      values (${A.tenant}, ${A.patient}, ${ACCEPTED_AT}, ${VERSION}, ${A.user})
      returning id`;
    const id = rows[0]?.id as string | undefined;
    if (!id) throw new Error("seed: acceptance insert returned no id");
    seededRow = id;
  });

  afterAll(async () => {
    if (!sql) return;
    // No ON DELETE CASCADE from patients on purpose (the record outlives a
    // patient cleanup), so the acceptances go before the tenants they belong to.
    await sql`delete from patient_terms_acceptances where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: RLS is in force — a cross-tenant insert is REFUSED", async () => {
    // Claims say tenant B; the row says tenant A. If this succeeds, RLS is off
    // and every assertion below is worthless.
    await expect(
      asRole(sql, "authenticated", claimsFor(B.tenant, "admin", B.user), (tx) =>
        insertAcceptance(tx, A, { tenant: A.tenant }),
      ),
    ).rejects.toThrow();
  });

  it("POSITIVE CONTROL: a well-formed insert by the acting user succeeds", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), (tx) =>
      insertAcceptance(tx, A),
    );
    expect(rows).toHaveLength(1);
  });

  it("tenant isolation: tenant B cannot SELECT tenant A's acceptances", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(B.tenant, "admin", B.user), (tx) =>
      tx`select id from patient_terms_acceptances where tenant_id = ${A.tenant}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant A CAN see its own, so the isolation above is not vacuous", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), (tx) =>
      tx`select id from patient_terms_acceptances where id = ${seededRow}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("recorded_by is PINNED to auth.uid() — claiming a different actor is REFUSED", async () => {
    // The actor is the one field a caller could lie about, and the field the
    // record's evidential value rests on. The WITH CHECK is what stops it, not
    // the server action that is supposed to set it correctly.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), (tx) =>
        insertAcceptance(tx, A, { recordedBy: B.user }),
      ),
    ).rejects.toThrow();
  });

  it("APPEND-ONLY: an UPDATE is refused", async () => {
    // No UPDATE policy AND the grant is revoked, so this fails at the table gate
    // even before policy evaluation. Either refusal is correct; what matters is
    // that no path rewrites an acceptance.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), (tx) =>
        tx`update patient_terms_acceptances
             set terms_version = 'tampered'
             where id = ${seededRow}`,
      ),
    ).rejects.toThrow();
  });

  it("APPEND-ONLY: a DELETE is refused", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), (tx) =>
        tx`delete from patient_terms_acceptances where id = ${seededRow}`,
      ),
    ).rejects.toThrow();
  });

  it("a blank terms_version is refused by the CHECK, not left to the caller", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), (tx) =>
        tx`insert into patient_terms_acceptances
             (tenant_id, patient_id, accepted_at, terms_version, recorded_by)
           values (${A.tenant}, ${A.patient}, ${ACCEPTED_AT}, '   ', ${A.user})`,
      ),
    ).rejects.toThrow();
  });

  it("re-accepting the SAME version writes a SECOND row, never a dedupe", async () => {
    // Deliberate: a patient re-signing on a later visit is a real event, and
    // discarding it would throw away the evidence this table exists to keep.
    // Runs inside one rolled-back transaction so it counts its own writes.
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.user), async (tx) => {
      await insertAcceptance(tx, A);
      await insertAcceptance(tx, A);
      return tx`select count(*)::int as n
                  from patient_terms_acceptances
                 where patient_id = ${A.patient} and terms_version = ${VERSION}`;
    });
    // The seeded row plus the two written here.
    expect(rows[0]?.n).toBe(3);
  });
});
