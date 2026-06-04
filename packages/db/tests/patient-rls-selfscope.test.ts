/**
 * patient-rls-selfscope.test.ts
 *
 * Adversarial proof of the patient identity layer's trust boundary (migration
 * 0010): a patient principal — running as the dedicated `patient` Postgres role
 * with a {tenant_id, patient_id} JWT — can read ONLY their own rows, and can
 * NEVER read another patient's rows (same tenant) or anything cross-tenant.
 *
 * Reuses the shared harness (rls-harness.ts): one privileged (owner) connection
 * used ONLY to seed/clean — it BYPASSES RLS by ownership — and every assertion
 * run through `asRole(sql, "patient", patientClaims(...))` inside a rolled-back
 * transaction. The privileged negative controls prove the data exists and that a
 * vacuous "0 rows because empty" pass is impossible.
 *
 * Threat model exercised here:
 *   1. patient A1 cannot see patient A2 (SAME tenant) — the headline guarantee
 *      a plain tenant-scope test would MISS, because A1 and A2 share a tenant.
 *   2. patient A1 cannot see tenant-B's patient — cross-tenant.
 *   3. a forged token with a real patient_id but the WRONG tenant_id sees
 *      nothing (the tenant_id conjunct in every policy).
 *   4. a token with NO patient_id claim sees nothing (fail-closed).
 *   5. the patient role is READ-ONLY: writes are denied at the table grant.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in CI without a DB — identical to cross-tenant-rls-isolation.test.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

/* ---------------------------------------------------------------------- */
/* Fixtures — two patients in tenant A, one in tenant B, each with a full   */
/* readable graph (appointment / episode / record / attachment / invoice). */
/* ---------------------------------------------------------------------- */

type PatientGraph = {
  patient: string;
  authUser: string;
  appointment: string;
  episode: string;
  record: string;
  attachment: string;
  invoice: string;
};

type TenantGraph = {
  tenant: string;
  role: string;
  user: string; // practitioner
  location: string;
  service: string;
  p1: PatientGraph;
  p2: PatientGraph;
};

const newPatient = (): PatientGraph => ({
  patient: randomUUID(),
  authUser: randomUUID(),
  appointment: randomUUID(),
  episode: randomUUID(),
  record: randomUUID(),
  attachment: randomUUID(),
  invoice: randomUUID(),
});

const newTenant = (): TenantGraph => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  p1: newPatient(),
  p2: newPatient(),
});

const A = newTenant();
const B = newTenant();

const START = "2026-04-06T09:00:00Z";
const END = "2026-04-06T10:00:00Z";

async function seedPatientGraph(
  p: Sql,
  t: TenantGraph,
  g: PatientGraph,
): Promise<void> {
  await p`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
          values (${g.patient}, ${t.tenant}, 'Seed Patient', ${g.authUser}, now())`;
  await p`insert into appointments
            (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at)
          values (${g.appointment}, ${t.tenant}, ${g.patient}, ${t.user}, ${t.location}, ${t.service}, ${START}, ${END})`;
  await p`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title)
          values (${g.episode}, ${t.tenant}, ${g.patient}, ${t.user}, 'Episode')`;
  // status 'draft' (not 'signed'): the self-scope assertions are independent of
  // record_status, and 'draft' keeps the row deletable so the afterAll tenant
  // cascade-delete is not blocked by the clinical_records immutability trigger
  // (a 'signed'/'locked' row cannot be deleted — by design, migration 0001).
  await p`insert into clinical_records (id, tenant_id, patient_id, episode_id, practitioner_id, status)
          values (${g.record}, ${t.tenant}, ${g.patient}, ${g.episode}, ${t.user}, 'draft')`;
  await p`insert into attachments (id, tenant_id, patient_id, storage_path, file_name)
          values (${g.attachment}, ${t.tenant}, ${g.patient}, ${`path/${g.attachment}`}, 'doc.pdf')`;
  await p`insert into invoices (id, tenant_id, patient_id, amount_cents)
          values (${g.invoice}, ${t.tenant}, ${g.patient}, 6000)`;
}

async function seedTenant(p: Sql, t: TenantGraph, label: string): Promise<void> {
  await p`insert into tenants (id, name, slug)
          values (${t.tenant}, ${`Patient RLS ${label}`}, ${`prls-${label}-${t.tenant}`})`;
  await p`insert into roles (id, tenant_id, slug, name)
          values (${t.role}, ${t.tenant}, 'therapist', 'Therapist')`;
  await p`insert into users (id, tenant_id, role_id, email, full_name)
          values (${t.user}, ${t.tenant}, ${t.role}, ${`u-${t.user}@example.pt`}, 'Seed Practitioner')`;
  await p`insert into locations (id, tenant_id, name)
          values (${t.location}, ${t.tenant}, 'Linda-a-Velha')`;
  await p`insert into services (id, tenant_id, location_id, name)
          values (${t.service}, ${t.tenant}, ${t.location}, 'Consulta')`;
  await seedPatientGraph(p, t, t.p1);
  await seedPatientGraph(p, t, t.p2);
}

/* ---------------------------------------------------------------------- */

describe.skipIf(!live)("patient RLS self-scope — own rows only", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A, "A");
    await seedTenant(sql, B, "B");
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  // Run a query as patient A1.
  const asA1 = <T>(fn: (tx: TransactionSql) => Promise<T>) =>
    asRole(sql, "patient", patientClaims(A.tenant, A.p1.patient), fn);

  /* ---- Negative control: the data is really there ------------------- */
  it("NEGATIVE CONTROL: owner sees A2 + B1 records; patient A1 does not", async () => {
    const ownerSees = await sql<{ id: string }[]>`
      select id from clinical_records where id in (${A.p2.record}, ${B.p1.record})
    `;
    expect(ownerSees.length).toBe(2);

    const a1Sees = await asA1((tx) =>
      tx<{ id: string }[]>`select id from clinical_records
        where id in (${A.p2.record}, ${B.p1.record})`,
    );
    expect(a1Sees.length).toBe(0);
  });

  /* ---- The headline guarantee: own row only, per table -------------- */
  type Probe = {
    table: string;
    /** id of A1's own row (must be visible). */
    own: string;
    /** id of A2's row — SAME tenant, different patient (must be invisible). */
    sameTenantOther: string;
    /** id of B1's row — cross-tenant (must be invisible). */
    crossTenant: string;
  };

  const probes: Probe[] = [
    { table: "patients", own: A.p1.patient, sameTenantOther: A.p2.patient, crossTenant: B.p1.patient },
    { table: "appointments", own: A.p1.appointment, sameTenantOther: A.p2.appointment, crossTenant: B.p1.appointment },
    { table: "clinical_episodes", own: A.p1.episode, sameTenantOther: A.p2.episode, crossTenant: B.p1.episode },
    { table: "clinical_records", own: A.p1.record, sameTenantOther: A.p2.record, crossTenant: B.p1.record },
    { table: "attachments", own: A.p1.attachment, sameTenantOther: A.p2.attachment, crossTenant: B.p1.attachment },
    { table: "invoices", own: A.p1.invoice, sameTenantOther: A.p2.invoice, crossTenant: B.p1.invoice },
  ];

  for (const probe of probes) {
    describe(`${probe.table}`, () => {
      it("patient A1 SELECT returns ONLY A1's own row", async () => {
        const rows = await asA1(
          async (tx) =>
            (await tx.unsafe(`select id::text as id from ${probe.table}`)) as {
              id: string;
            }[],
        );
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(probe.own);
        // The two assertions that ARE the trust boundary:
        expect(ids).not.toContain(probe.sameTenantOther); // another patient, same tenant
        expect(ids).not.toContain(probe.crossTenant); // another tenant entirely
        // And nothing else leaked in.
        expect(ids).toEqual([probe.own]);
      });

      it("patient A1 cannot fetch A2's row even by naming its id", async () => {
        const rows = await asA1(async (tx) =>
          (await tx.unsafe(`select id::text as id from ${probe.table} where id = $1`, [
            probe.sameTenantOther,
          ])) as { id: string }[],
        );
        expect(rows.length).toBe(0);
      });

      it("patient A1 cannot fetch the cross-tenant row by id", async () => {
        const rows = await asA1(async (tx) =>
          (await tx.unsafe(`select id::text as id from ${probe.table} where id = $1`, [
            probe.crossTenant,
          ])) as { id: string }[],
        );
        expect(rows.length).toBe(0);
      });
    });
  }

  /* ---- Forged / missing claims fail closed -------------------------- */
  it("a real patient_id but the WRONG tenant_id sees nothing (tenant conjunct)", async () => {
    const rows = await asRole(
      sql,
      "patient",
      // A1's id, but claiming tenant B — a forged cross-tenant token.
      patientClaims(B.tenant, A.p1.patient),
      (tx) => tx<{ id: string }[]>`select id from patients`,
    );
    expect(rows.length).toBe(0);
  });

  it("no patient_id claim at all sees nothing (fail-closed)", async () => {
    const rows = await asRole(
      sql,
      "patient",
      JSON.stringify({ tenant_id: A.tenant }), // tenant only, no patient_id
      (tx) => tx<{ id: string }[]>`select id from patients`,
    );
    expect(rows.length).toBe(0);
  });

  /* ---- The patient role is READ-ONLY -------------------------------- */
  it("patient cannot UPDATE even their own row (no write grant)", async () => {
    await expect(
      asA1((tx) => tx`update patients set notes = 'x' where id = ${A.p1.patient}`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("patient cannot INSERT a patient row (no write grant)", async () => {
    await expect(
      asA1(
        (tx) =>
          tx`insert into patients (tenant_id, full_name) values (${A.tenant}, 'X')`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("patient cannot read staff-only tables (e.g. users) — no policy, no grant", async () => {
    await expect(asA1((tx) => tx`select id from users`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  /* ---- Sanity: staff path is unaffected by the new role ------------- */
  it("staff (authenticated, tenant A) still sees BOTH A1 and A2 patients", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin"), (tx) =>
      tx<{ id: string }[]>`select id from patients where tenant_id = ${A.tenant}`,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(A.p1.patient);
    expect(ids).toContain(A.p2.patient); // staff are tenant-scoped, not self-scoped
  });
});
