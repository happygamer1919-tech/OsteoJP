/**
 * cross-tenant-rls-isolation.test.ts
 *
 * Phase 6 "deliberate RLS-break attempts across tenants" — extends the
 * single-table audit PR #89 shipped for ai_ingestion_requests to EVERY other
 * tenant-scoped domain table that carries an RLS isolation policy. Reuses #89's
 * harness (tests/rls-harness.ts): one privileged connection used ONLY to
 * seed/clean, and every isolation assertion run through `asRole("authenticated",
 * …)` inside a rolled-back transaction with a simulated tenant JWT.
 *
 * Tables covered here (ai_ingestion_requests is already covered by #89):
 *
 *   Standard policy  (FOR ALL TO authenticated, USING/WITH CHECK
 *   tenant_id = jwt_tenant_id()) — the four-verb template applies directly:
 *     roles, users, locations, services, patients, appointments,
 *     form_templates, clinical_episodes, attachments, invoices,
 *     patient_locations (0005), availability_templates + time_off (0006),
 *     service_location_prices (0007).
 *
 *   Non-standard policies — tested for what the policy ACTUALLY says, not the
 *   four-verb template:
 *     tenants          — keyed on `id = jwt_tenant_id()`, not tenant_id; it is
 *                        the identity row, so there is no own-tenant INSERT case
 *                        (id already exists). Cross-tenant SELECT/UPDATE/DELETE +
 *                        foreign-INSERT rejection are asserted.
 *     clinical_records — per-verb policies gated on tenant_id AND
 *                        jwt_role() IN ('owner','admin','therapist'). The
 *                        four-verb cross-tenant template runs under an admin JWT;
 *                        an extra suite proves the ROLE gate (reception denied,
 *                        therapist allowed) — the dimension a plain tenant test
 *                        would miss.
 *     audit_log        — append-only: only SELECT + INSERT policies exist, so
 *                        UPDATE/DELETE are denied for ALL rows (0 rows, no error),
 *                        including the tenant's own. Asserted as the append-only
 *                        guarantee, plus the usual cross-tenant SELECT/INSERT.
 *
 * CORRECTNESS (inherited from #89): RLS is ENABLE-not-FORCE, so assertions must
 * run on the role-switched `authenticated` connection — never the owner. An
 * explicit negative control (owner sees tenant-B's row; authenticated+A does not)
 * makes a vacuous pass impossible, and every SELECT case carries the same
 * B-row-invisible sanity check.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase owner role,
 * postgresql://postgres:postgres@127.0.0.1:54322/postgres) with migrations
 * applied. Skipped when DATABASE_URL is absent so `vitest run` stays green in CI.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live, type AppRole } from "./rls-harness";

/* ---------------------------------------------------------------------- */
/* Fixture ids — one full FK-satisfying graph per tenant. Random so an     */
/* aborted prior run can't collide on unique slugs/emails.                 */
/* ---------------------------------------------------------------------- */

type Ids = {
  tenant: string;
  role: string;
  user: string;
  location: string;
  location2: string;
  service: string;
  patient: string;
  appointment: string;
  formTemplate: string;
  episode: string;
  record: string;
  attachment: string;
  invoice: string;
  patientLocation: string;
  availability: string;
  timeOff: string;
  servicePrice: string;
  audit: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  location2: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
  appointment: randomUUID(),
  formTemplate: randomUUID(),
  episode: randomUUID(),
  record: randomUUID(),
  attachment: randomUUID(),
  invoice: randomUUID(),
  patientLocation: randomUUID(),
  availability: randomUUID(),
  timeOff: randomUUID(),
  servicePrice: randomUUID(),
  audit: randomUUID(),
});

const A = newIds();
const B = newIds();

const START = "2026-01-05T09:00:00Z";
const END = "2026-01-05T10:00:00Z";

/**
 * Seed one tenant's full graph on the privileged (owner) connection, which
 * bypasses RLS by ownership. Insertion order respects FKs.
 */
async function seedTenant(p: Sql, x: Ids, label: string): Promise<void> {
  await p`insert into tenants (id, name, slug)
          values (${x.tenant}, ${`RLS Test ${label}`}, ${`rls-${label}-${x.tenant}`})`;
  await p`insert into roles (id, tenant_id, slug, name)
          values (${x.role}, ${x.tenant}, 'admin', 'Admin')`;
  await p`insert into users (id, tenant_id, role_id, email, full_name)
          values (${x.user}, ${x.tenant}, ${x.role}, ${`u-${x.user}@example.pt`}, 'Seed User')`;
  await p`insert into locations (id, tenant_id, name)
          values (${x.location}, ${x.tenant}, 'Loc 1'),
                 (${x.location2}, ${x.tenant}, 'Loc 2')`;
  await p`insert into services (id, tenant_id, location_id, name)
          values (${x.service}, ${x.tenant}, ${x.location}, 'Service')`;
  await p`insert into patients (id, tenant_id, full_name)
          values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at)
          values (${x.appointment}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service}, ${START}, ${END})`;
  await p`insert into form_templates (id, tenant_id, key, title, schema)
          values (${x.formTemplate}, ${x.tenant}, 'osteopathy',
                  ${JSON.stringify({ pt: "Osteopatia", en: "Osteopathy" })}::jsonb,
                  ${JSON.stringify({ fields: [] })}::jsonb)`;
  await p`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title)
          values (${x.episode}, ${x.tenant}, ${x.patient}, ${x.user}, 'Episode')`;
  await p`insert into clinical_records (id, tenant_id, patient_id, episode_id, practitioner_id, status)
          values (${x.record}, ${x.tenant}, ${x.patient}, ${x.episode}, ${x.user}, 'draft')`;
  await p`insert into attachments (id, tenant_id, patient_id, storage_path, file_name)
          values (${x.attachment}, ${x.tenant}, ${x.patient}, ${`path/${x.attachment}`}, 'file.pdf')`;
  await p`insert into invoices (id, tenant_id, patient_id, amount_cents)
          values (${x.invoice}, ${x.tenant}, ${x.patient}, 1000)`;
  await p`insert into patient_locations (id, tenant_id, patient_id, location_id)
          values (${x.patientLocation}, ${x.tenant}, ${x.patient}, ${x.location})`;
  await p`insert into availability_templates (id, tenant_id, user_id, location_id, weekday, start_time, end_time)
          values (${x.availability}, ${x.tenant}, ${x.user}, ${x.location}, 1, '09:00', '17:00')`;
  await p`insert into time_off (id, tenant_id, user_id, starts_at, ends_at, reason)
          values (${x.timeOff}, ${x.tenant}, ${x.user}, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', 'vacation')`;
  await p`insert into service_location_prices (id, tenant_id, service_id, location_id, price_cents)
          values (${x.servicePrice}, ${x.tenant}, ${x.service}, ${x.location}, 5000)`;
  await p`insert into audit_log (id, tenant_id, action, entity_type, entity_id)
          values (${x.audit}, ${x.tenant}, 'seed.action', 'patient', ${x.patient})`;
}

/* ---------------------------------------------------------------------- */
/* Standard four-verb suite config: tenant_id = jwt_tenant_id() tables.     */
/* INSERT shapes genuinely differ per table (different NOT NULL/FK cols),   */
/* so own/cross INSERT are closures; SELECT/UPDATE/DELETE are uniform.      */
/* ---------------------------------------------------------------------- */

type StdCfg = {
  table: string;
  policyDesc: string;
  /** Tenant-scope column for the SELECT sanity check. Default "tenant_id". */
  tenantCol?: string;
  /** JWT role to assert under. Default "admin". */
  role?: AppRole;
  ownRowId: string;
  otherRowId: string;
  insertOwn: (tx: TransactionSql) => Promise<readonly { id: string }[]>;
  insertCross: (tx: TransactionSql) => Promise<unknown>;
  /** A harmless, existing column to SET in the cross-tenant UPDATE attempt. */
  updateCrossSet: string;
};

describe.skipIf(!live)("cross-tenant RLS isolation — all tenant-scoped tables", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A, "A");
    await seedTenant(sql, B, "B");
  });

  afterAll(async () => {
    if (!sql) return;
    // Every tenant_id FK is ON DELETE CASCADE, so deleting the two tenant rows
    // cascade-cleans the whole seeded graph in one statement.
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  /* ---- The required negative control (run once, explicitly) ----------- */
  it("NEGATIVE CONTROL: owner sees tenant-B's patient, authenticated+A does not", async () => {
    // Owner connection (no role switch) bypasses RLS → must see B's row.
    const ownerSees = await sql<{ id: string }[]>`
      select id from patients where id = ${B.patient}
    `;
    expect(ownerSees.length).toBe(1);

    // Same row, same query, but under a tenant-A authenticated JWT → invisible.
    const aSees = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
      tx<{ id: string }[]>`select id from patients where id = ${B.patient}`,
    );
    expect(aSees.length).toBe(0);
  });

  /* ---- Standard tenant_id = jwt_tenant_id() tables -------------------- */
  const standardTables: StdCfg[] = [
    {
      table: "roles",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.role,
      otherRowId: B.role,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into roles (tenant_id, slug, name)
          values (${A.tenant}, ${`r-${randomUUID()}`}, 'X') returning id`,
      insertCross: (tx) =>
        tx`insert into roles (tenant_id, slug, name)
          values (${B.tenant}, ${`r-${randomUUID()}`}, 'X') returning id`,
      updateCrossSet: "name = 'mutated'",
    },
    {
      table: "users",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.user,
      otherRowId: B.user,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into users (id, tenant_id, role_id, email, full_name)
          values (${randomUUID()}, ${A.tenant}, ${A.role}, ${`u-${randomUUID()}@example.pt`}, 'X') returning id`,
      insertCross: (tx) =>
        tx`insert into users (id, tenant_id, role_id, email, full_name)
          values (${randomUUID()}, ${B.tenant}, ${B.role}, ${`u-${randomUUID()}@example.pt`}, 'X') returning id`,
      updateCrossSet: "full_name = 'mutated'",
    },
    {
      table: "locations",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.location,
      otherRowId: B.location,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into locations (tenant_id, name)
          values (${A.tenant}, 'X') returning id`,
      insertCross: (tx) =>
        tx`insert into locations (tenant_id, name) values (${B.tenant}, 'X') returning id`,
      updateCrossSet: "name = 'mutated'",
    },
    {
      table: "services",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.service,
      otherRowId: B.service,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into services (tenant_id, name)
          values (${A.tenant}, 'X') returning id`,
      insertCross: (tx) =>
        tx`insert into services (tenant_id, name) values (${B.tenant}, 'X') returning id`,
      updateCrossSet: "name = 'mutated'",
    },
    {
      table: "patients",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.patient,
      otherRowId: B.patient,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into patients (tenant_id, full_name)
          values (${A.tenant}, 'X') returning id`,
      insertCross: (tx) =>
        tx`insert into patients (tenant_id, full_name) values (${B.tenant}, 'X') returning id`,
      updateCrossSet: "full_name = 'mutated'",
    },
    {
      table: "appointments",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.appointment,
      otherRowId: B.appointment,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into appointments
          (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${A.tenant}, ${A.patient}, ${A.user}, ${A.location}, ${START}, ${END}) returning id`,
      insertCross: (tx) =>
        tx`insert into appointments
          (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${B.tenant}, ${B.patient}, ${B.user}, ${B.location}, ${START}, ${END}) returning id`,
      updateCrossSet: "notes = 'mutated'",
    },
    {
      table: "form_templates",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.formTemplate,
      otherRowId: B.formTemplate,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into form_templates (tenant_id, key, title, schema)
          values (${A.tenant}, ${`k-${randomUUID()}`}, ${"{}"}::jsonb, ${"{}"}::jsonb) returning id`,
      insertCross: (tx) =>
        tx`insert into form_templates (tenant_id, key, title, schema)
          values (${B.tenant}, ${`k-${randomUUID()}`}, ${"{}"}::jsonb, ${"{}"}::jsonb) returning id`,
      updateCrossSet: "is_active = false",
    },
    {
      table: "clinical_episodes",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.episode,
      otherRowId: B.episode,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into clinical_episodes (tenant_id, patient_id, title)
          values (${A.tenant}, ${A.patient}, 'X') returning id`,
      insertCross: (tx) =>
        tx`insert into clinical_episodes (tenant_id, patient_id, title)
          values (${B.tenant}, ${B.patient}, 'X') returning id`,
      updateCrossSet: "title = 'mutated'",
    },
    {
      table: "clinical_records",
      policyDesc: "per-verb, tenant_id = jwt AND jwt_role() IN (owner,admin,therapist)",
      role: "admin",
      ownRowId: A.record,
      otherRowId: B.record,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into clinical_records (tenant_id, patient_id)
          values (${A.tenant}, ${A.patient}) returning id`,
      insertCross: (tx) =>
        tx`insert into clinical_records (tenant_id, patient_id)
          values (${B.tenant}, ${B.patient}) returning id`,
      updateCrossSet: "version = 1",
    },
    {
      table: "attachments",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.attachment,
      otherRowId: B.attachment,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into attachments (tenant_id, patient_id, storage_path, file_name)
          values (${A.tenant}, ${A.patient}, ${`path/${randomUUID()}`}, 'f.pdf') returning id`,
      insertCross: (tx) =>
        tx`insert into attachments (tenant_id, patient_id, storage_path, file_name)
          values (${B.tenant}, ${B.patient}, ${`path/${randomUUID()}`}, 'f.pdf') returning id`,
      updateCrossSet: "file_name = 'mutated'",
    },
    {
      table: "invoices",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.invoice,
      otherRowId: B.invoice,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into invoices (tenant_id, patient_id, amount_cents)
          values (${A.tenant}, ${A.patient}, 100) returning id`,
      insertCross: (tx) =>
        tx`insert into invoices (tenant_id, patient_id, amount_cents)
          values (${B.tenant}, ${B.patient}, 100) returning id`,
      updateCrossSet: "currency = 'EUR'",
    },
    {
      table: "patient_locations",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.patientLocation,
      otherRowId: B.patientLocation,
      // location2 avoids the (tenant,patient,location) unique already seeded.
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into patient_locations (tenant_id, patient_id, location_id)
          values (${A.tenant}, ${A.patient}, ${A.location2}) returning id`,
      insertCross: (tx) =>
        tx`insert into patient_locations (tenant_id, patient_id, location_id)
          values (${B.tenant}, ${B.patient}, ${B.location2}) returning id`,
      updateCrossSet: "created_at = now()",
    },
    {
      table: "availability_templates",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.availability,
      otherRowId: B.availability,
      // weekday 3 distinct from the seeded weekday 1 → no dedupe collision.
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into availability_templates
          (tenant_id, user_id, location_id, weekday, start_time, end_time)
          values (${A.tenant}, ${A.user}, ${A.location}, 3, '08:00', '12:00') returning id`,
      insertCross: (tx) =>
        tx`insert into availability_templates
          (tenant_id, user_id, location_id, weekday, start_time, end_time)
          values (${B.tenant}, ${B.user}, ${B.location}, 3, '08:00', '12:00') returning id`,
      updateCrossSet: "is_active = false",
    },
    {
      table: "time_off",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.timeOff,
      otherRowId: B.timeOff,
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into time_off (tenant_id, user_id, starts_at, ends_at, reason)
          values (${A.tenant}, ${A.user}, '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z', 'sick') returning id`,
      insertCross: (tx) =>
        tx`insert into time_off (tenant_id, user_id, starts_at, ends_at, reason)
          values (${B.tenant}, ${B.user}, '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z', 'sick') returning id`,
      updateCrossSet: "note = 'mutated'",
    },
    {
      table: "service_location_prices",
      policyDesc: "FOR ALL, tenant_id = jwt_tenant_id()",
      ownRowId: A.servicePrice,
      otherRowId: B.servicePrice,
      // location2 avoids the (tenant,service,location) unique already seeded.
      insertOwn: (tx) =>
        tx<{ id: string }[]>`insert into service_location_prices (tenant_id, service_id, location_id, price_cents)
          values (${A.tenant}, ${A.service}, ${A.location2}, 100) returning id`,
      insertCross: (tx) =>
        tx`insert into service_location_prices (tenant_id, service_id, location_id, price_cents)
          values (${B.tenant}, ${B.service}, ${B.location2}, 100) returning id`,
      updateCrossSet: "is_active = false",
    },
  ];

  for (const cfg of standardTables) {
    const tenantCol = cfg.tenantCol ?? "tenant_id";
    const claims = () => claimsFor(A.tenant, cfg.role);

    describe(`${cfg.table} — ${cfg.policyDesc}`, () => {
      it("SELECT under tenant-A returns only A's rows; tenant-B row invisible", async () => {
        const rows = await asRole(sql, "authenticated", claims(), async (tx) =>
          (await tx.unsafe(
            `select id::text as id, ${tenantCol}::text as scope from ${cfg.table}`,
          )) as { id: string; scope: string }[],
        );
        const ids = rows.map((r) => r.id);
        expect(ids).toContain(cfg.ownRowId);
        // SANITY: proves RLS is actually on — B's seed row must not leak.
        expect(ids).not.toContain(cfg.otherRowId);
        expect(rows.every((r) => r.scope === A.tenant)).toBe(true);
      });

      it("INSERT of an own-tenant row under tenant-A JWT succeeds (WITH CHECK allows)", async () => {
        const inserted = await asRole(sql, "authenticated", claims(), cfg.insertOwn);
        expect(inserted.length).toBe(1);
      });

      it("INSERT of a tenant-B row under tenant-A JWT is rejected by WITH CHECK", async () => {
        await expect(
          asRole(sql, "authenticated", claims(), cfg.insertCross),
        ).rejects.toThrow(/row-level security/i);
      });

      it("UPDATE of a tenant-B row under tenant-A JWT affects 0 rows (USING filters silently)", async () => {
        const updated = await asRole(sql, "authenticated", claims(), async (tx) =>
          (await tx.unsafe(
            `update ${cfg.table} set ${cfg.updateCrossSet} where id = $1 returning id`,
            [cfg.otherRowId],
          )) as { id: string }[],
        );
        expect(updated.length).toBe(0);
      });

      it("DELETE of a tenant-B row under tenant-A JWT affects 0 rows", async () => {
        const deleted = await asRole(sql, "authenticated", claims(), async (tx) =>
          (await tx.unsafe(
            `delete from ${cfg.table} where id = $1 returning id`,
            [cfg.otherRowId],
          )) as { id: string }[],
        );
        expect(deleted.length).toBe(0);
      });
    });
  }

  /* ---- tenants — identity table (keyed on id, not tenant_id) ---------- */
  describe("tenants — identity table (policy: id = jwt_tenant_id())", () => {
    it("SELECT under tenant-A returns only tenant A; tenant B invisible", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        (await tx`select id::text as id from tenants`) as { id: string }[],
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(A.tenant);
      expect(ids).not.toContain(B.tenant);
      expect(ids.every((id) => id === A.tenant)).toBe(true);
    });

    // No own-tenant INSERT case: the row whose id = jwt already exists, so an
    // own insert is a PK collision, not an RLS scenario. A FOREIGN insert is the
    // meaningful WITH CHECK probe.
    it("INSERT of a foreign tenant (id != jwt) under tenant-A JWT is rejected by WITH CHECK", async () => {
      await expect(
        asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
          tx`insert into tenants (id, name, slug)
             values (${randomUUID()}, 'X', ${`s-${randomUUID()}`})`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("UPDATE of tenant B under tenant-A JWT affects 0 rows", async () => {
      const updated = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        (await tx`update tenants set name = 'mutated' where id = ${B.tenant} returning id`) as {
          id: string;
        }[],
      );
      expect(updated.length).toBe(0);
    });

    it("DELETE of tenant B under tenant-A JWT affects 0 rows", async () => {
      const deleted = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        (await tx`delete from tenants where id = ${B.tenant} returning id`) as { id: string }[],
      );
      expect(deleted.length).toBe(0);
    });
  });

  /* ---- clinical_records — the ROLE dimension the tenant test misses --- */
  describe("clinical_records — role gate (jwt_role() IN owner/admin/therapist)", () => {
    it("SELECT as RECEPTION (tenant-A) returns 0 rows — clinical reads denied to reception", async () => {
      const rows = await asRole(
        sql,
        "authenticated",
        claimsFor(A.tenant, "reception"),
        async (tx) => (await tx`select id::text as id from clinical_records`) as { id: string }[],
      );
      // Reception is in-tenant but the role gate denies the read entirely.
      expect(rows.length).toBe(0);
      expect(rows.map((r) => r.id)).not.toContain(A.record);
    });

    it("SELECT as THERAPIST (tenant-A) sees tenant-A's record — role gate allows", async () => {
      const rows = await asRole(
        sql,
        "authenticated",
        claimsFor(A.tenant, "therapist"),
        async (tx) => (await tx`select id::text as id from clinical_records`) as { id: string }[],
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(A.record);
      expect(ids).not.toContain(B.record);
    });

    it("INSERT as RECEPTION (own tenant) is rejected by WITH CHECK — role gate on writes", async () => {
      await expect(
        asRole(sql, "authenticated", claimsFor(A.tenant, "reception"), async (tx) =>
          tx`insert into clinical_records (tenant_id, patient_id)
             values (${A.tenant}, ${A.patient}) returning id`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  /* ---- audit_log — append-only (SELECT + INSERT policies only) -------- */
  describe("audit_log — append-only (no UPDATE/DELETE policy ⇒ denied for all rows)", () => {
    it("SELECT under tenant-A returns only A's rows; tenant-B row invisible", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        (await tx`select id::text as id, tenant_id::text as scope from audit_log`) as {
          id: string;
          scope: string;
        }[],
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(A.audit);
      expect(ids).not.toContain(B.audit);
      expect(rows.every((r) => r.scope === A.tenant)).toBe(true);
    });

    it("INSERT of an own-tenant row under tenant-A JWT succeeds", async () => {
      const inserted = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        tx<{ id: string }[]>`insert into audit_log (tenant_id, action, entity_type)
          values (${A.tenant}, 'x', 'patient') returning id`,
      );
      expect(inserted.length).toBe(1);
    });

    it("INSERT of a tenant-B row under tenant-A JWT is rejected by WITH CHECK", async () => {
      await expect(
        asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
          tx`insert into audit_log (tenant_id, action, entity_type)
             values (${B.tenant}, 'x', 'patient')`,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("UPDATE of the tenant's OWN row affects 0 rows — append-only (no UPDATE policy)", async () => {
      const updated = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        (await tx`update audit_log set action = 'mutated' where id = ${A.audit} returning id`) as {
          id: string;
        }[],
      );
      expect(updated.length).toBe(0);
    });

    it("DELETE of the tenant's OWN row affects 0 rows — append-only (no DELETE policy)", async () => {
      const deleted = await asRole(sql, "authenticated", claimsFor(A.tenant), async (tx) =>
        (await tx`delete from audit_log where id = ${A.audit} returning id`) as { id: string }[],
      );
      expect(deleted.length).toBe(0);
    });
  });
});
