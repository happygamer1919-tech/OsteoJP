/**
 * MIGRATION 0074 PART A — the three SECURITY DEFINER WRITE doors for
 * `appointment_confirm_codes`.
 *
 * ==========================================================================
 * WHAT THEY REPLACE, AND WHY THE PROOF IS ABOUT PRIVILEGE RATHER THAN SPEED
 * ==========================================================================
 * 0072 revoked the table from PUBLIC, anon, `authenticated` and `patient`
 * (SR-29) and built only the READ door, so no application role could write it
 * at all: every INSERT answered `permission denied for table
 * appointment_confirm_codes`. CONFIRM-02 shipped through the service_role
 * handle as the only non-migration path available. These three doors are the
 * shape SR-29 would have chosen had a writer existed when 0072 was authored.
 *
 * THE PROPERTY THAT MATTERS IS THE ONE A GRANT WOULD HAVE LOST. A
 * `GRANT INSERT` would let any authenticated session write any row, in any
 * tenant. Each door instead takes the tenant as an ARGUMENT and proves the
 * appointment belongs to it in the same statement, so a caller that pairs the
 * wrong two values writes nothing. That arm is the reason this file exists, and
 * it is asserted in both directions.
 *
 * GATING: needs a live privileged DATABASE_URL with 0074 applied.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const F = {
  tenant: randomUUID(),
  otherTenant: randomUUID(),
  practitioner: randomUUID(),
  outsider: randomUUID(),
  location: randomUUID(),
  patient: randomUUID(),
  appointment: randomUUID(),
};

describe.skipIf(!live)("0074 part A: the confirm-code write doors", () => {
  let sql: Sql;

  const codeRows = async (): Promise<{ code_hash: string; consumed_at: string | null }[]> =>
    (await sql`select code_hash, consumed_at::text from appointment_confirm_codes
                where tenant_id = ${F.tenant} order by code_hash`) as {
      code_hash: string;
      consumed_at: string | null;
    }[];

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values
      (${F.tenant},      'W74A',     ${`w74a-${F.tenant}`}),
      (${F.otherTenant}, 'W74A out', ${`w74ao-${F.otherTenant}`})`;
    await sql`insert into users (id, tenant_id, email, full_name) values
      (${F.practitioner}, ${F.tenant}, ${`p-${F.practitioner}@x.pt`}, 'Dra Teste')`;
    await sql`insert into locations (id, tenant_id, name) values (${F.location}, ${F.tenant}, 'Sede')`;
    await sql`insert into patients (id, tenant_id, full_name) values (${F.patient}, ${F.tenant}, 'Paciente')`;
    await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
      values (${F.appointment}, ${F.tenant}, ${F.patient}, ${F.practitioner}, ${F.location},
              '2026-06-01T09:00:00Z', '2026-06-01T10:00:00Z')`;
  });

  afterAll(async () => {
    await sql`delete from appointments where tenant_id = ${F.tenant}`;
    await sql`delete from patients where tenant_id = ${F.tenant}`;
    await sql`delete from locations where tenant_id = ${F.tenant}`;
    await sql`delete from users where tenant_id = ${F.tenant}`;
    await sql`delete from tenants where id in (${F.tenant}, ${F.otherTenant})`;
    await sql.end();
  });

  /* ---------------- as declared ---------------- */

  const doors = [
    { name: "issue_confirm_code", nargs: 3 },
    { name: "withdraw_confirm_code", nargs: 2 },
    { name: "consume_confirm_code", nargs: 3 },
  ];

  for (const door of doors) {
    it(`${door.name} is SECURITY DEFINER, VOLATILE, owned by postgres`, async () => {
      const [row] = (await sql`
        select p.pronargs, p.provolatile, p.prosecdef, r.rolname as owner, p.proacl is not null as has_acl
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          join pg_roles r on r.oid = p.proowner
         where n.nspname = 'public' and p.proname = ${door.name}`) as {
        pronargs: number;
        provolatile: string;
        prosecdef: boolean;
        owner: string;
        has_acl: boolean;
      }[];
      expect(row, `${door.name} does not exist`).toBeDefined();
      expect(row!.pronargs).toBe(door.nargs);
      // VOLATILE, not STABLE: these WRITE, and a stable marking would let the
      // planner treat a write as cacheable within a statement.
      expect(row!.provolatile).toBe("v");
      expect(row!.prosecdef).toBe(true);
      expect(row!.owner).toBe("postgres");
      expect(row!.has_acl).toBe(true);
    });

    it(`${door.name} is EXECUTE-able by authenticated only`, async () => {
      const rows = (await sql`
        select coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
         where n.nspname = 'public' and p.proname = ${door.name} and a.privilege_type = 'EXECUTE'`) as {
        grantee: string;
      }[];
      const g = rows.map((r) => r.grantee);
      expect(g).toContain("authenticated");
      // A WRITE door reachable by anon over PostgREST would be worse than the
      // read door 0072's own post-check caught.
      expect(g).not.toContain("anon");
      expect(g).not.toContain("patient");
      expect(g).not.toContain("PUBLIC");
    });
  }

  it("THE TABLE ITSELF IS STILL GRANTED TO NOBODY", async () => {
    // The doors exist so the REVOKE can stay. If a grant ever reappears, the
    // narrow functions become decoration.
    const rows = (await sql`
      select grantee from information_schema.role_table_grants
       where table_name = 'appointment_confirm_codes'
         and grantee in ('anon', 'authenticated', 'patient', 'PUBLIC')`) as { grantee: string }[];
    expect(rows).toEqual([]);
  });

  /* ---------------- the property a GRANT would have lost ---------------- */

  it("issue REFUSES when the appointment does not belong to the named tenant", async () => {
    const [row] = (await sql`
      select public.issue_confirm_code(${HASH_A}, ${F.otherTenant}::uuid, ${F.appointment}::uuid) as ok`) as {
      ok: boolean;
    }[];
    expect(row!.ok).toBe(false);
    expect(await codeRows()).toEqual([]);
  });

  it("issue REFUSES for an appointment that does not exist", async () => {
    const [row] = (await sql`
      select public.issue_confirm_code(${HASH_A}, ${F.tenant}::uuid, ${randomUUID()}::uuid) as ok`) as {
      ok: boolean;
    }[];
    expect(row!.ok).toBe(false);
    expect(await codeRows()).toEqual([]);
  });

  it("issue writes exactly one row for the right pair, and reports true", async () => {
    const [row] = (await sql`
      select public.issue_confirm_code(${HASH_A}, ${F.tenant}::uuid, ${F.appointment}::uuid) as ok`) as {
      ok: boolean;
    }[];
    expect(row!.ok).toBe(true);
    const rows = await codeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code_hash).toBe(HASH_A);
    expect(rows[0]!.consumed_at).toBeNull();
  });

  it("ONE LIVE CODE PER APPOINTMENT: a second issue reports false and writes nothing", async () => {
    const [row] = (await sql`
      select public.issue_confirm_code(${HASH_B}, ${F.tenant}::uuid, ${F.appointment}::uuid) as ok`) as {
      ok: boolean;
    }[];
    expect(row!.ok).toBe(false);
    expect(await codeRows()).toHaveLength(1);
  });

  it("withdraw REFUSES from the wrong tenant, and succeeds from the right one", async () => {
    const [wrong] = (await sql`
      select public.withdraw_confirm_code(${HASH_A}, ${F.otherTenant}::uuid) as ok`) as { ok: boolean }[];
    expect(wrong!.ok).toBe(false);
    expect(await codeRows()).toHaveLength(1);

    const [right] = (await sql`
      select public.withdraw_confirm_code(${HASH_A}, ${F.tenant}::uuid) as ok`) as { ok: boolean }[];
    expect(right!.ok).toBe(true);
    expect(await codeRows()).toEqual([]);
  });

  it("a WITHDRAWN code frees the appointment to be issued again", async () => {
    const [row] = (await sql`
      select public.issue_confirm_code(${HASH_C}, ${F.tenant}::uuid, ${F.appointment}::uuid) as ok`) as {
      ok: boolean;
    }[];
    expect(row!.ok).toBe(true);
  });

  it("consume spends it once, and the SECOND call reports false", async () => {
    const now = "2026-06-01T08:00:00Z";
    const [first] = (await sql`
      select public.consume_confirm_code(${HASH_C}, ${F.tenant}::uuid, ${now}::timestamptz) as ok`) as {
      ok: boolean;
    }[];
    expect(first!.ok).toBe(true);

    const [second] = (await sql`
      select public.consume_confirm_code(${HASH_C}, ${F.tenant}::uuid, ${now}::timestamptz) as ok`) as {
      ok: boolean;
    }[];
    // The `consumed_at IS NULL` predicate inside the UPDATE is the lock, so the
    // second press loses to the database rather than to a read this code did.
    expect(second!.ok).toBe(false);

    const rows = await codeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumed_at).not.toBeNull();
  });

  it("consume REFUSES from the wrong tenant even for a live code", async () => {
    await sql`delete from appointment_confirm_codes where tenant_id = ${F.tenant}`;
    await sql`select public.issue_confirm_code(${HASH_A}, ${F.tenant}::uuid, ${F.appointment}::uuid)`;
    const [row] = (await sql`
      select public.consume_confirm_code(${HASH_A}, ${F.otherTenant}::uuid, now()) as ok`) as {
      ok: boolean;
    }[];
    expect(row!.ok).toBe(false);
    const rows = await codeRows();
    expect(rows[0]!.consumed_at).toBeNull();
  });

  it("a WITHDRAWN code cannot be withdrawn twice, and a CONSUMED one cannot be withdrawn at all", async () => {
    // Withdraw is for a send that did not happen. It must never be able to
    // remove a code a patient has already acted on.
    await sql`update appointment_confirm_codes set consumed_at = now() where tenant_id = ${F.tenant}`;
    const [row] = (await sql`
      select public.withdraw_confirm_code(${HASH_A}, ${F.tenant}::uuid) as ok`) as { ok: boolean }[];
    expect(row!.ok).toBe(false);
    expect(await codeRows()).toHaveLength(1);
  });
});
