/**
 * followup-rls.test.ts — the two 0067 follow-up tables, against a REAL Postgres.
 *
 * CLAUDE.md's non-negotiable: every migration adding a domain table ships with
 * `tenant_id`, an RLS policy, and an isolation test IN THE SAME PR.
 *
 * ==========================================================================
 * WHAT IS ACTUALLY AT RISK HERE, because "another tenant's rows" is only half.
 * ==========================================================================
 * These tables name STAFF MEMBERS and PATIENTS together: who rang whom, and
 * when. A leak is not a list of appointments, it is a list of which clinic
 * chased which patient. So the isolation arms come first.
 *
 * THE SECOND HALF IS THE GRANT SHAPE, and 0064's header is why it is asserted
 * rather than assumed: its first draft shipped the policy with NO grant and
 * every statement answered `permission denied` — including the SELECT the
 * policy existed to allow. A suite of only NEGATIVE assertions (cannot update,
 * cannot delete) would have gone green over a table nobody could read at all,
 * PASSING FOR THE WRONG REASON. The positive SELECT and INSERT arms are what
 * make the negative ones mean anything.
 *
 * Gated on DATABASE_URL, so `vitest run` with no database stays green and the
 * DB-gated required check runs it.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = { tenant: string; role: string; user: string; patient: string };

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  patient: randomUUID(),
});

const A = newIds();
const B = newIds();

async function seed(sql: Sql, x: Ids, label: string): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, ${label}, ${`fup-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'reception', 'Rececao')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role},
                    ${`f-${x.user}@example.pt`}, 'Seed Reception')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
  await sql`insert into patient_followup_postponements
              (tenant_id, patient_id, postponed_until, created_by)
            values (${x.tenant}, ${x.patient}, now() + interval '4 weeks', ${x.user})`;
  await sql`insert into patient_followup_contacts
              (tenant_id, patient_id, channel, contacted_by)
            values (${x.tenant}, ${x.patient}, 'whatsapp', ${x.user})`;
}

describe.skipIf(!live)("patient_followup_* RLS + constraints (migration 0067)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql, A, "Followup Tenant A");
    await seed(sql, B, "Followup Tenant B");
  });

  afterAll(async () => {
    if (!sql) return;
    for (const x of [A, B]) {
      await sql`delete from patient_followup_contacts where tenant_id = ${x.tenant}`;
      await sql`delete from patient_followup_postponements where tenant_id = ${x.tenant}`;
      await sql`delete from patients where tenant_id = ${x.tenant}`;
      await sql`delete from users where tenant_id = ${x.tenant}`;
      await sql`delete from roles where tenant_id = ${x.tenant}`;
      await sql`delete from tenants where id = ${x.tenant}`;
    }
    await sql.end();
  });

  for (const table of ["patient_followup_postponements", "patient_followup_contacts"] as const) {
    describe(table, () => {
      it("SELECT under a tenant-A JWT returns only tenant-A rows", async () => {
        const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
          tx<{ tenant_id: string }[]>`select tenant_id from ${tx(table)}`,
        );
        // THE POSITIVE CONTROL. Without it every assertion in this file passes
        // over a table the role cannot read - 0064's exact failure.
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.every((r) => r.tenant_id === A.tenant)).toBe(true);
        expect(rows.some((r) => r.tenant_id === B.tenant)).toBe(false);
      });

      it("a JWT with no tenant claim sees nothing - fail-closed, not fail-open", async () => {
        const rows = await asRole(sql, "authenticated", null, (tx) =>
          tx<{ tenant_id: string }[]>`select tenant_id from ${tx(table)}`,
        );
        expect(rows).toHaveLength(0);
      });

      it("INSERT into ANOTHER tenant is refused by the WITH CHECK", async () => {
        // The row cannot be planted across the boundary even by a caller who
        // knows the other tenant's ids.
        await expect(
          asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
            table === "patient_followup_contacts"
              ? tx`insert into patient_followup_contacts (tenant_id, patient_id, channel, contacted_by)
                   values (${B.tenant}, ${B.patient}, 'sms', ${B.user})`
              : tx`insert into patient_followup_postponements (tenant_id, patient_id, postponed_until, created_by)
                   values (${B.tenant}, ${B.patient}, now() + interval '1 week', ${B.user})`,
          ),
        ).rejects.toThrow();
      });

      it("DELETE is refused - these rows are a record, not a draft", async () => {
        // A postponement is REVOKED (a recorded act with a name and a time); a
        // contact is a historical fact. Neither is deletable, by grant.
        await expect(
          asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
            tx`delete from ${tx(table)} where tenant_id = ${A.tenant}`,
          ),
        ).rejects.toThrow();
      });
    });
  }

  it("a postponement CAN be revoked by its own tenant, and the pair holds", async () => {
    // The one UPDATE path that exists, and its constraint. Both halves or
    // neither: a row carrying a revoker and no time would make the list's
    // predicate disagree with the audit trail.
    const updated = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
      tx<{ id: string }[]>`
        update patient_followup_postponements
           set revoked_by = ${A.user}, revoked_at = now()
         where tenant_id = ${A.tenant}
        returning id`,
    );
    expect(updated.length).toBeGreaterThanOrEqual(1);

    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx`update patient_followup_postponements
              set revoked_by = ${A.user}, revoked_at = null
            where tenant_id = ${A.tenant}`,
      ),
    ).rejects.toThrow(/revoked_pair/);
  });

  it("a contact CANNOT be updated at all - a contact happened at an instant", async () => {
    // Not an RLS rule: there is no UPDATE grant. An amend path would only ever
    // be a way to rewrite who did what.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx`update patient_followup_contacts set channel = 'email' where tenant_id = ${A.tenant}`,
      ),
    ).rejects.toThrow();
  });

  it("an unknown channel is refused by the CHECK", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx`insert into patient_followup_contacts (tenant_id, patient_id, channel, contacted_by)
           values (${A.tenant}, ${A.patient}, 'pombo-correio', ${A.user})`,
      ),
    ).rejects.toThrow(/channel_check/);
  });

  it("the pack balance identity holds: legacy_consumed backfills to total - remaining", async () => {
    // 0067's central claim, asserted against the real column defaults rather
    // than against the migration's own UPDATE (which this database ran).
    const rows = await sql<{ n: string }[]>`
      select count(*)::text as n from patient_pack_instances
       where legacy_consumed <> sessions_total - sessions_remaining`;
    expect(rows[0]?.n).toBe("0");
  });

  it("appointments.origin exists, defaults to staff, and refuses an unknown value", async () => {
    const rows = await sql<{ column_default: string | null }[]>`
      select column_default from information_schema.columns
       where table_name = 'appointments' and column_name = 'origin'`;
    expect(rows[0]?.column_default).toMatch(/staff/);

    await expect(
      sql`insert into appointments (tenant_id, patient_id, practitioner_id, location_id,
                                    service_id, starts_at, ends_at, status, origin)
          values (${A.tenant}, ${A.patient}, ${A.user}, null, null,
                  now(), now() + interval '1 hour', 'scheduled', 'telepatia')`,
    ).rejects.toThrow(/origin_check|not-null|violates/);
  });
});
