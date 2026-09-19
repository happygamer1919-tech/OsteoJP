/**
 * RGPD-01 — `patient_rgpd_acceptances` is append-only and tenant-scoped, and the
 * patient role cannot reach it at all.
 *
 * ==========================================================================
 * THIS SUITE GATES ON THE SCHEMA, NOT ON AN ENV FLAG
 * ==========================================================================
 * `NEXT-AFTER-0089_patient_rgpd_acceptances.sql` lives in `migrations-pending/`,
 * which `drizzle-kit migrate` cannot see by construction. CI's DB-gated job
 * therefore runs against a database WITHOUT this table, and a suite that
 * asserted its behaviour there would be red for a reason that has nothing to do
 * with the code under review.
 *
 * So it asks the database. Where somebody has applied the pending SQL (a lane,
 * or production after promotion) these run and must pass; everywhere else they
 * skip and SAY SO. `describe.skip` is honest here in a way a passing stub is
 * not: it reports "not measured", never "fine".
 *
 * ==========================================================================
 * WHY THERE IS NO FIXTURE, AND THAT IS THE POINT RATHER THAN A SHORTCUT
 * ==========================================================================
 * Every refusal below is a TABLE-PRIVILEGE refusal, and Postgres raises those
 * at planning time — an UPDATE that matches zero rows is still refused if the
 * role lacks UPDATE. So the append-only property is provable as a REAL runtime
 * refusal against an empty table, with no tenant, user or patient seeded.
 *
 * That matters beyond convenience. Seeding a patient here would mean satisfying
 * the 0029 patient_number trigger, the tenant FK and the users FK, and a suite
 * that breaks when an unrelated fixture requirement changes is a suite people
 * learn to skip. The one thing a fixture would add — that an existing ROW
 * cannot be edited — is the same privilege being tested, one row later.
 *
 * THE POSITIVE CONTROL IS NOT OPTIONAL. 0058 shipped a first draft whose REVOKE
 * was present and whose GRANT was missing, so `authenticated` held nothing at
 * all and its append-only assertions passed FOR THE WRONG REASON. The first
 * test below asserts SELECT and INSERT are actually GRANTED, so every refusal
 * after it means "this privilege specifically", not "this role has nothing".
 */
import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";

import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

const TABLE = "public.patient_rgpd_acceptances";

async function rgpdApplied(): Promise<boolean> {
  if (!live) return false;
  const probe = connect();
  try {
    const rows = await probe`select to_regclass(${TABLE}) is not null as present`;
    return Boolean(rows[0]?.present);
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const applied = await rgpdApplied();
const d = applied ? describe : describe.skip;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PATIENT = "22222222-2222-2222-2222-222222222222";

/** Did the statement fail because the ROLE lacks the privilege? */
async function refusedForPrivilege(sql: Sql, statement: string): Promise<boolean> {
  try {
    await asRole(sql, "authenticated", claimsFor(TENANT), async (tx) => {
      await tx.unsafe(statement);
    });
    return false;
  } catch (err) {
    // 42501 = insufficient_privilege. Matched on the CODE, not on message text,
    // so a Postgres wording change does not turn this green.
    return (err as { code?: string })?.code === "42501";
  }
}

d("the RGPD consent table is append-only at the TABLE GRANT", () => {
  it("POSITIVE CONTROL: authenticated really does hold SELECT and INSERT", async () => {
    // Without this, every refusal below would also pass on a table nobody
    // granted anything on — which is exactly how 0058's first draft went green.
    const sql = connect();
    try {
      const rows = await sql`
        select has_table_privilege('authenticated', ${TABLE}, 'SELECT') as can_select,
               has_table_privilege('authenticated', ${TABLE}, 'INSERT') as can_insert`;
      expect(rows[0]?.can_select).toBe(true);
      expect(rows[0]?.can_insert).toBe(true);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("authenticated holds NO update, delete or truncate", async () => {
    const sql = connect();
    try {
      const rows = await sql`
        select has_table_privilege('authenticated', ${TABLE}, 'UPDATE') as can_update,
               has_table_privilege('authenticated', ${TABLE}, 'DELETE') as can_delete,
               has_table_privilege('authenticated', ${TABLE}, 'TRUNCATE') as can_truncate`;
      // Supabase's schema-wide DEFAULT PRIVILEGES hand these over at CREATE
      // time. They are absent ONLY because the migration REVOKEs them.
      expect(rows[0]?.can_update).toBe(false);
      expect(rows[0]?.can_delete).toBe(false);
      expect(rows[0]?.can_truncate).toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("REFUSES a real UPDATE and a real DELETE at runtime, not merely on paper", async () => {
    const sql = connect();
    try {
      expect(
        await refusedForPrivilege(sql, `update ${TABLE} set rgpd_version = 'tampered'`),
        "an UPDATE was not refused - the table is not append-only",
      ).toBe(true);
      expect(
        await refusedForPrivilege(sql, `delete from ${TABLE}`),
        "a DELETE was not refused - the history can be erased",
      ).toBe(true);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

d("the table carries RLS, and its read scope is the tenant", () => {
  it("has RLS enabled", async () => {
    const sql = connect();
    try {
      const rows = await sql`select relrowsecurity from pg_class where oid = ${TABLE}::regclass`;
      // Policies on a table with RLS off enforce nothing at all, while still
      // reading as security from the policy list.
      expect(rows[0]?.relrowsecurity).toBe(true);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("carries exactly two policies, one SELECT and one INSERT, and no more", async () => {
    const sql = connect();
    try {
      const rows = await sql`
        select cmd, count(*)::int as n
          from pg_policies
         where schemaname = 'public' and tablename = 'patient_rgpd_acceptances'
         group by cmd order by cmd`;
      // An UPDATE or DELETE policy appearing here would mean somebody added the
      // shape the REVOKE is the second line of defence against.
      expect(rows.map((r) => [r.cmd, r.n])).toEqual([
        ["INSERT", 1],
        ["SELECT", 1],
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("scopes SELECT by tenant and pins the actor on INSERT", async () => {
    const sql = connect();
    try {
      const rows = await sql`
        select policyname, qual, with_check
          from pg_policies
         where schemaname = 'public' and tablename = 'patient_rgpd_acceptances'`;
      const sel = rows.find((r) => String(r.policyname).endsWith("_tenant_select"));
      const ins = rows.find((r) => String(r.policyname).endsWith("_tenant_insert"));
      expect(String(sel?.qual)).toContain("jwt_tenant_id()");
      expect(String(ins?.with_check)).toContain("jwt_tenant_id()");
      // The one field a caller could lie about, decided by the database.
      expect(String(ins?.with_check)).toContain("auth.uid()");
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

d("the patient role cannot reach the table at all", () => {
  it("holds no privilege on it", async () => {
    const sql = connect();
    try {
      const rows = await sql`
        select has_table_privilege('patient', ${TABLE}, 'SELECT') as can_select,
               has_table_privilege('patient', ${TABLE}, 'INSERT') as can_insert`;
      // Consent is captured by staff from a signed form. The patient's own copy
      // is that form, not this row.
      expect(rows[0]?.can_select).toBe(false);
      expect(rows[0]?.can_insert).toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("is refused a real SELECT at runtime", async () => {
    const sql = connect();
    try {
      let refused = false;
      try {
        await asRole(sql, "patient", patientClaims(TENANT, PATIENT), async (tx) => {
          await tx.unsafe(`select 1 from ${TABLE} limit 1`);
        });
      } catch (err) {
        refused = (err as { code?: string })?.code === "42501";
      }
      expect(refused, "the patient role could read the consent table").toBe(true);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

d("no existing table was widened to carry this", () => {
  it("patients has gained no consent column", async () => {
    const sql = connect();
    try {
      const rows = await sql`
        select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'patients'
           and (column_name like '%rgpd%' or column_name like '%consent%')`;
      // Shape 2, refused by the same owner ruling that refused it for terms in
      // 0058: a consent that overwrites its own history cannot answer what a
      // patient agreed to on a given date.
      expect(rows.map((r) => r.column_name)).toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
