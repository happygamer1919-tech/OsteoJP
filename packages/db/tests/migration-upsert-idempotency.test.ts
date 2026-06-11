/**
 * migration-upsert-idempotency.test.ts
 *
 * Live-DB coverage for the data-migration pipeline foundation
 * (src/migration/): staging → validation → idempotent import, against the
 * real target tables, entirely through withTenantContext (RLS applies — the
 * pipeline never uses the BYPASSRLS admin handle).
 *
 * What is proven:
 *   1. IDEMPOTENCY — importing the same synthetic Fisiozero batch twice
 *      creates ZERO duplicate rows: run #2 reports 0 inserted and the target
 *      table counts are unchanged. The staging-table ledger
 *      (imported_entity_id keyed by tenant/source_system/entity_type/
 *      source_id) is what makes this hold.
 *   2. STATUS TRANSITIONS — pending → validated → imported; a validation
 *      failure lands `failed` with a structured PII-free error_detail; an
 *      out-of-order transition throws; re-staging a failed row resets it to
 *      pending and clears the error.
 *   3. TENANT SCOPING — a second tenant sees none of the first tenant's
 *      staging rows through the same withTenantContext seam.
 *
 * Fixtures are 100% SYNTHETIC (tests/fixtures/fisiozero-synthetic.ts) — fake
 * PT names, both Fisiozero locations, never real data.
 *
 * GATING: requires a live, privileged DATABASE_URL with migrations applied
 * (incl. 0014). Skipped when absent so `vitest run` stays green without a DB.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  importRecords,
  markImported,
  markValidated,
  markFailed,
  MigrationStagingError,
  stageRows,
  validateMigrationRecord,
  withTenantContext,
  type MigrationResolvers,
  type TenantClaims,
} from "../index";
import { migrationStagingRows } from "../src/schema";
import {
  invalidPatientRow,
  LOCATION_KEYS,
  PRACTITIONER_KEY,
  SOURCE_SYSTEM,
  syntheticBatch,
} from "./fixtures/fisiozero-synthetic";
import { connect, live } from "./rls-harness";

describe.skipIf(!live)("migration pipeline — staging + idempotent upsert (live DB)", () => {
  let sql: Sql;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const practitionerId = randomUUID();
  const locationIds = { "linda-a-velha": randomUUID(), "castelo-branco": randomUUID() };
  const batchId = randomUUID();

  const claimsA: TenantClaims = { tenant_id: tenantA, user_role: "admin" };
  const claimsB: TenantClaims = { tenant_id: tenantB, user_role: "admin" };

  const resolvers: MigrationResolvers = {
    locationIdByKey: locationIds,
    practitionerIdByKey: { [PRACTITIONER_KEY]: practitionerId },
  };

  const batch = syntheticBatch();
  const invalid = invalidPatientRow();
  const allRows = [...batch, invalid];

  beforeAll(async () => {
    sql = connect();
    // Privileged seeding of what the platform would already have: the tenant,
    // its locations, and the practitioner the resolver keys point at.
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantA}, 'Migration Import Tenant A', ${`mig-imp-a-${tenantA}`}),
             (${tenantB}, 'Migration Import Tenant B', ${`mig-imp-b-${tenantB}`})
    `;
    await sql`
      insert into locations (id, tenant_id, name)
      values (${locationIds["linda-a-velha"]}, ${tenantA}, 'Linda-a-Velha'),
             (${locationIds["castelo-branco"]}, ${tenantA}, 'Castelo Branco')
    `;
    await sql`
      insert into users (id, tenant_id, email, full_name)
      values (${practitionerId}, ${tenantA}, ${`jp-${tenantA}@example.pt`}, 'JP (sintético)')
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    // Child-first, then the tenants (cascade covers the rest).
    await sql`delete from attachments where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from clinical_records where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from clinical_episodes where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from appointments where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from patient_locations where tenant_id in (${tenantA}, ${tenantB})`;
    await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
    await sql.end();
  });

  const targetCounts = async () => {
    const [c] = await sql<
      {
        patients: number;
        patient_locations: number;
        appointments: number;
        episodes: number;
        records: number;
        attachments: number;
      }[]
    >`
      select
        (select count(*)::int from patients          where tenant_id = ${tenantA}) as patients,
        (select count(*)::int from patient_locations where tenant_id = ${tenantA}) as patient_locations,
        (select count(*)::int from appointments      where tenant_id = ${tenantA}) as appointments,
        (select count(*)::int from clinical_episodes where tenant_id = ${tenantA}) as episodes,
        (select count(*)::int from clinical_records  where tenant_id = ${tenantA}) as records,
        (select count(*)::int from attachments       where tenant_id = ${tenantA}) as attachments
    `;
    return c!;
  };

  it("stages the batch as pending, then validation splits validated/failed", async () => {
    const staged = await withTenantContext(claimsA, (tx) =>
      stageRows(
        tx,
        tenantA,
        batchId,
        allRows.map((r) => ({
          sourceSystem: SOURCE_SYSTEM,
          entityType: r.record.entityType,
          sourceId: r.record.data.sourceId,
          raw: r.raw,
        })),
      ),
    );
    expect(staged.staged).toBe(allRows.length);

    // Validate every staged row against its normalized record.
    await withTenantContext(claimsA, async (tx) => {
      for (const stagedRow of staged.rows) {
        const fixture = allRows.find((r) => r.record.data.sourceId === stagedRow.sourceId)!;
        const issue = validateMigrationRecord(fixture.record);
        if (issue) {
          await markFailed(tx, tenantA, stagedRow.id, issue);
        } else {
          await markValidated(tx, tenantA, stagedRow.id);
        }
      }
    });

    const statuses = await sql<{ status: string; count: number }[]>`
      select status, count(*)::int as count from migration_staging_rows
      where tenant_id = ${tenantA} group by status
    `;
    const byStatus = Object.fromEntries(statuses.map((s) => [s.status, s.count]));
    expect(byStatus).toEqual({ validated: batch.length, failed: 1 });
  });

  it("failed row carries a structured, PII-free error detail", async () => {
    const [row] = await sql<{ error_detail: { code: string; fields: string[] } }[]>`
      select error_detail from migration_staging_rows
      where tenant_id = ${tenantA} and source_id = ${invalid.record.data.sourceId}
    `;
    expect(row!.error_detail.code).toBe("validation_failed");
    expect(row!.error_detail.fields).toContain("fullName");
    // PII-free contract: the detail names fields, never values.
    expect(JSON.stringify(row!.error_detail)).not.toContain("sintético");
  });

  it("run #1 imports every validated record into the target tables", async () => {
    const summary = await withTenantContext(claimsA, (tx) =>
      importRecords(
        tx,
        tenantA,
        SOURCE_SYSTEM,
        allRows.map((r) => r.record),
        resolvers,
      ),
    );

    expect(summary.inserted).toBe(batch.length); // all 8 valid synthetic records
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(1); // the validation-failed row is skipped

    const counts = await targetCounts();
    expect(counts).toEqual({
      patients: 3,
      patient_locations: 4, // 1 + 1 + 2 (one patient attends both locations)
      appointments: 2,
      episodes: 1,
      records: 1,
      attachments: 1,
    });

    // Ledger: every imported staging row points at a real target uuid.
    const [ledger] = await sql<{ missing: number }[]>`
      select count(*)::int as missing from migration_staging_rows
      where tenant_id = ${tenantA} and status = 'imported' and imported_entity_id is null
    `;
    expect(ledger!.missing).toBe(0);
  });

  it("run #2 with the same batch creates ZERO duplicates (idempotent re-run)", async () => {
    const before = await targetCounts();

    const summary = await withTenantContext(claimsA, (tx) =>
      importRecords(
        tx,
        tenantA,
        SOURCE_SYSTEM,
        allRows.map((r) => r.record),
        resolvers,
      ),
    );

    expect(summary.inserted).toBe(0);
    // Patients, appointments, episode, attachment refresh in place; the
    // clinical record is skipped (migrated clinical history is never rewritten).
    expect(summary.updated).toBe(batch.length - 1);
    expect(summary.skipped).toBe(2); // clinical record + the failed row
    expect(summary.failed).toBe(0);

    expect(await targetCounts()).toEqual(before);
  });

  it("re-staging the failed row resets it to pending and clears the error", async () => {
    const restaged = await withTenantContext(claimsA, (tx) =>
      stageRows(tx, tenantA, batchId, [
        {
          sourceSystem: SOURCE_SYSTEM,
          entityType: invalid.record.entityType,
          sourceId: invalid.record.data.sourceId,
          raw: { ...invalid.raw, nome: "Corrigido (sintético)" },
        },
      ]),
    );
    expect(restaged.staged).toBe(1);

    const [row] = await sql<{ status: string; error_detail: unknown }[]>`
      select status, error_detail from migration_staging_rows
      where tenant_id = ${tenantA} and source_id = ${invalid.record.data.sourceId}
    `;
    expect(row!.status).toBe("pending");
    expect(row!.error_detail).toBeNull();
  });

  it("re-staging an imported row preserves the ledger (status + imported_entity_id)", async () => {
    const patientSourceId = batch[0]!.record.data.sourceId;
    await withTenantContext(claimsA, (tx) =>
      stageRows(tx, tenantA, batchId, [
        {
          sourceSystem: SOURCE_SYSTEM,
          entityType: "patient",
          sourceId: patientSourceId,
          raw: batch[0]!.raw,
        },
      ]),
    );

    const [row] = await sql<{ status: string; imported_entity_id: string | null }[]>`
      select status, imported_entity_id from migration_staging_rows
      where tenant_id = ${tenantA} and source_id = ${patientSourceId}
    `;
    expect(row!.status).toBe("imported");
    expect(row!.imported_entity_id).not.toBeNull();
  });

  it("out-of-order transition throws (pending → imported is illegal)", async () => {
    const [pendingRow] = await sql<{ id: string }[]>`
      select id from migration_staging_rows
      where tenant_id = ${tenantA} and status = 'pending' limit 1
    `;
    expect(pendingRow).toBeDefined();

    await expect(
      withTenantContext(claimsA, (tx) =>
        markImported(tx, tenantA, pendingRow!.id, randomUUID()),
      ),
    ).rejects.toThrow(MigrationStagingError);
  });

  it("tenant B sees none of tenant A's staging rows through the same seam", async () => {
    const rows = await withTenantContext(claimsB, (tx) =>
      tx.select({ id: migrationStagingRows.id }).from(migrationStagingRows),
    );
    expect(rows.length).toBe(0);
  });
});
