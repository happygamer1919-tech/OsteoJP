/**
 * patient-audit-append-only.test.ts — DB-level proof of migration 0054.
 *
 * Counsel requires the patient audit trail to be append-only, "enforced at the
 * database level rather than by convention, plus a trigger refusing
 * modification" (docs/rgpd-token-flow.md section 8). 0054 builds that in THREE
 * layers, and only a live database can prove any of them:
 *
 *   1. No UPDATE/DELETE GRANT to the application roles.
 *   2. No UPDATE/DELETE POLICY — Postgres denies a command with no policy.
 *   3. A BEFORE UPDATE/DELETE/TRUNCATE statement trigger.
 *
 * WHY THE THIRD LAYER IS NOT REDUNDANT, and why this file tests it separately:
 * RLS does not apply to a BYPASSRLS role, and it does not gate TRUNCATE AT ALL.
 * So layers 1 and 2 leave the whole trail erasable by one statement from a role
 * the platform already uses. The `service_role` cases below are the ones that
 * would go green on a convention-only implementation and red on this one - they
 * are the point of the file, not an extra.
 *
 * Also proves the single-use guarantee is the PRIMARY KEY rather than a
 * read-then-write check: a duplicate token hash is rejected by the database, so
 * two simultaneous redemptions cannot both proceed.
 *
 * Same harness as the rest of packages/db/tests: an owner connection seeds and
 * cleans; every assertion runs through asRole(...) inside a rolled-back tx.
 * GATING: needs a live DATABASE_URL with migrations applied; skipped without one.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const d = live ? describe : describe.skip;

/** 64 lowercase hex, the only shape action_token_consumptions.token_hash takes. */
const hash = (seed: string): string =>
  seed.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "a");

d("0054 patient_audit_log is append-only at the database level", () => {
  let sql: Sql;
  let tenantId: string;

  beforeAll(async () => {
    sql = connect();
    tenantId = randomUUID();
    await sql`insert into tenants (id, name, slug)
              values (${tenantId}, ${"AuditTrail Co"}, ${`audit-${tenantId.slice(0, 8)}`})`;
  });

  afterAll(async () => {
    if (!sql) return;
    // The trigger refuses DELETE even to the owner, which is exactly the
    // property under test, so the audit rows cannot be cleaned up directly.
    // The tenant FK has no cascade for the same reason, so the rows are dropped
    // by disabling the trigger for this one statement - a privileged act, which
    // is the point: erasure is possible only by someone able to alter the table.
    await sql`alter table patient_audit_log disable trigger patient_audit_log_append_only`;
    await sql`delete from patient_audit_log where tenant_id = ${tenantId}`;
    await sql`alter table patient_audit_log enable trigger patient_audit_log_append_only`;
    // No cleanup of action_token_consumptions here: this block never inserts
    // into it, and the DELETE would still be REFUSED. That is not an accident of
    // this test - it is the FOR EACH STATEMENT property asserted above, which
    // fires on a statement matching zero rows. The guard caught its own author's
    // cleanup, which is the best evidence it is real.
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();
  });

  async function seedRow(): Promise<string> {
    const id = randomUUID();
    await sql`insert into patient_audit_log
                (id, tenant_id, appointment_id, auth_means, action, outcome, ip)
              values (${id}, ${tenantId}, ${randomUUID()}, 'signed_token',
                      'confirm', 'success', '203.0.113.7')`;
    return id;
  }

  it("accepts an INSERT from the authenticated role, in its own tenant", async () => {
    const inserted = await asRole(sql, "authenticated", claimsFor(tenantId), async (tx) => {
      const rows = await tx`insert into patient_audit_log
          (tenant_id, appointment_id, auth_means, action, outcome)
        values (${tenantId}, ${randomUUID()}, 'signed_token', 'cancel', 'success')
        returning id`;
      return rows.length;
    });
    expect(inserted).toBe(1);
  });

  it("refuses an UPDATE from the authenticated role", async () => {
    const id = await seedRow();
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantId), (tx) =>
        tx`update patient_audit_log set outcome = 'refused' where id = ${id}`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a DELETE from the authenticated role", async () => {
    const id = await seedRow();
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantId), (tx) =>
        tx`delete from patient_audit_log where id = ${id}`,
      ),
    ).rejects.toThrow();
  });

  // ---- The layer RLS alone could never provide -----------------------------
  // service_role holds BYPASSRLS. On a convention-only (policy-absence)
  // implementation these three would SUCCEED and the trail would be rewritable
  // by the platform's own privileged connection.

  it("refuses an UPDATE from service_role, which BYPASSES RLS", async () => {
    const id = await seedRow();
    await expect(
      asRole(sql, "service_role", claimsFor(tenantId), (tx) =>
        tx`update patient_audit_log set outcome = 'refused' where id = ${id}`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a DELETE from service_role, which BYPASSES RLS", async () => {
    const id = await seedRow();
    await expect(
      asRole(sql, "service_role", claimsFor(tenantId), (tx) =>
        tx`delete from patient_audit_log where id = ${id}`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a TRUNCATE, which RLS does not gate at all", async () => {
    await seedRow();
    await expect(
      asRole(sql, "service_role", claimsFor(tenantId), (tx) =>
        tx`truncate table patient_audit_log`,
      ),
    ).rejects.toThrow();
  });

  it("fires even when the UPDATE matches ZERO rows", async () => {
    // FOR EACH STATEMENT, not FOR EACH ROW: "no rows affected" must never be
    // mistakable for "the guard ran and allowed it".
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantId), (tx) =>
        tx`update patient_audit_log set outcome = 'refused'
           where id = ${randomUUID()}`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a refusal with no stated reason", async () => {
    // Counsel's Result field, split into outcome + reason. An unexplained
    // refusal is the unaudited hole the split exists to close.
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantId), (tx) =>
        tx`insert into patient_audit_log
             (tenant_id, appointment_id, auth_means, action, outcome)
           values (${tenantId}, ${randomUUID()}, 'signed_token', 'cancel', 'refused')`,
      ),
    ).rejects.toThrow();
  });

  it("accepts a refusal that states one", async () => {
    const n = await asRole(sql, "authenticated", claimsFor(tenantId), async (tx) => {
      const rows = await tx`insert into patient_audit_log
          (tenant_id, appointment_id, auth_means, action, outcome, reason)
        values (${tenantId}, ${randomUUID()}, 'signed_token', 'cancel',
                'refused', 'inside_cutoff')
        returning id`;
      return rows.length;
    });
    expect(n).toBe(1);
  });

  it("refuses an authentication means outside the counsel pair", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantId), (tx) =>
        tx`insert into patient_audit_log
             (tenant_id, appointment_id, auth_means, action, outcome)
           values (${tenantId}, ${randomUUID()}, 'password', 'confirm', 'success')`,
      ),
    ).rejects.toThrow();
  });
});

d("0054 action_token_consumptions makes a token single-use", () => {
  let sql: Sql;
  let tenantId: string;

  beforeAll(async () => {
    sql = connect();
    tenantId = randomUUID();
    await sql`insert into tenants (id, name, slug)
              values (${tenantId}, ${"Consumption Co"}, ${`cons-${tenantId.slice(0, 8)}`})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`alter table action_token_consumptions disable trigger action_token_consumptions_append_only`;
    await sql`delete from action_token_consumptions where tenant_id = ${tenantId}`;
    await sql`alter table action_token_consumptions enable trigger action_token_consumptions_append_only`;
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();
  });

  it("rejects a SECOND insert of the same token hash", async () => {
    // THIS is the single-use guarantee. Not a read-then-write check, which two
    // simultaneous redemptions would both pass: the primary key means the second
    // transaction loses and rolls back whatever it had already written.
    const h = hash("deadbeef");
    await expect(
      asRole(sql, "authenticated", claimsFor(tenantId), async (tx) => {
        await tx`insert into action_token_consumptions
                   (token_hash, tenant_id, appointment_id, action)
                 values (${h}, ${tenantId}, ${randomUUID()}, 'confirm')`;
        await tx`insert into action_token_consumptions
                   (token_hash, tenant_id, appointment_id, action)
                 values (${h}, ${tenantId}, ${randomUUID()}, 'confirm')`;
      }),
    ).rejects.toThrow();
  });

  it("rejects anything that is not a 64-char lowercase hex digest", async () => {
    // A raw token is `<payload>.<signature>`, ~183 chars with a dot in it, so it
    // can never match. Storing a live credential by mistake is a constraint
    // violation rather than a table quietly full of them.
    for (const bad of [
      "not-a-hash",
      "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
      "eyJ0IjoiYWJjIn0.c2lnbmF0dXJl",
      "",
    ]) {
      await expect(
        asRole(sql, "authenticated", claimsFor(tenantId), (tx) =>
          tx`insert into action_token_consumptions
               (token_hash, tenant_id, appointment_id, action)
             values (${bad}, ${tenantId}, ${randomUUID()}, 'confirm')`,
        ),
      ).rejects.toThrow();
    }
  });

  it("refuses a DELETE, so a spent token can never become redeemable again", async () => {
    const h = hash("cafebabe");
    await sql`insert into action_token_consumptions
                (token_hash, tenant_id, appointment_id, action)
              values (${h}, ${tenantId}, ${randomUUID()}, 'cancel')`;
    await expect(
      asRole(sql, "service_role", claimsFor(tenantId), (tx) =>
        tx`delete from action_token_consumptions where token_hash = ${h}`,
      ),
    ).rejects.toThrow();
  });
});
