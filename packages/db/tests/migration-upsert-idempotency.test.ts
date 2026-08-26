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
import { and, eq } from "drizzle-orm";
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
import { migrationStagingRows, patients } from "../src/schema";
import { generateReconciliationReport } from "../src/migration/reconciliation";
import type { MigrationRecord } from "../src/migration/types";
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

  // R16 (migration 0043): admin is READ-ONLY on clinical_records — a historical
  // clinical-history import writes clinical_records/attachments, so the pipeline
  // must run under a principal that can write clinical data in-tenant. That is
  // OWNER (all in-tenant) or service_role, NOT admin. The pipeline has no
  // production caller yet; when it is wired it must use owner/service_role (see
  // DECISIONS 2026-07-25). The tenant-isolation assertion (claimsB sees none of
  // tenant A) is unchanged — owner is still tenant-scoped by tenant_id.
  const claimsA: TenantClaims = { tenant_id: tenantA, user_role: "owner" };
  const claimsB: TenantClaims = { tenant_id: tenantB, user_role: "owner" };

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

  it("PERSISTS all four carried fields - the round trip", async () => {
    // Until 2026-08-24 these were derived by the adapter, validated, staged in
    // `raw`, and then DROPPED at the last step: importPatient mapped ten
    // columns and none of these were among them. The type carried a warning in
    // capitals saying so. This is the assertion that the wire is connected.
    const rows = await sql`
      select patient_number, primary_location_id, health_insurance_numbers, sex, phone
        from patients
       where tenant_id = ${tenantA}
       order by patient_number`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      // PL-09: an unplaced patient is looser, not tighter - patientLocationScope
      // falls back to unrestricted - so a null here would widen visibility.
      expect(r.primary_location_id).not.toBeNull();
      expect(Object.values(locationIds)).toContain(r.primary_location_id);
      // 0051 keeps this NOT NULL DEFAULT '[]', so it is an array either way.
      expect(Array.isArray(r.health_insurance_numbers)).toBe(true);
      // NOT NULL and filled by the trigger when the import supplies nothing.
      expect(Number(r.patient_number)).toBeGreaterThan(0);
    }
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
    // NOTHING REFRESHES IN PLACE ANY MORE, ruled 2026-08-26. Every entity used
    // to take an UPDATE path on `ledger.importedEntityId` and report `updated`,
    // so a second --apply re-wrote every target row while REHEARSAL.md §7.3 and
    // PROD-RUN.md §6 both describe it as writing nothing.
    expect(summary.updated).toBe(0);
    // batch.length imported rows + the validation-failed row, all skipped.
    // `skipped` carrying the full count is the idempotency proof; the zeros
    // above are also what an empty batch would print.
    expect(summary.skipped).toBe(batch.length + 1);
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

  /* ================================================================== *
   * B7: A FAILED LEDGER ROW IS RETRIED ON THE NEXT RUN                  *
   * ================================================================== *
   * It used to be skipped outright, so a row that failed once was skipped by
   * EVERY later run. PROD-RUN.md's "re-run the identical command" and the
   * idempotency proof both quietly excluded it, permanently and silently. */

  it("a FAILED row is retried on the next run, and records that it was retried", async () => {
    const tenantR = randomUUID();
    const batchR = randomUUID();
    const locR = randomUUID();
    const claimsR: TenantClaims = { tenant_id: tenantR, user_role: "owner" };
    await sql`insert into tenants (id, name, slug) values (${tenantR}, 'Retry', ${`mig-retry-${tenantR}`})`;
    await sql`insert into locations (id, tenant_id, name) values (${locR}, ${tenantR}, 'Linda-a-Velha')`;
    try {
      const rec: MigrationRecord = {
        entityType: "patient",
        data: {
          sourceId: "retry-p1",
          fullName: "Paciente Sintético",
          locationKeys: ["linda-a-velha"],
          primaryLocationKey: "linda-a-velha",
        },
      } as MigrationRecord;
      const res: MigrationResolvers = { locationIdByKey: { "linda-a-velha": locR }, practitionerIdByKey: {} };

      await withTenantContext(claimsR, async (tx) => {
        await stageRows(tx, tenantR, batchR, [
          { sourceSystem: SOURCE_SYSTEM, entityType: "patient", sourceId: "retry-p1", raw: {} },
        ]);
      });
      // Drive it to `failed` the way a real import failure would.
      const [row] = await withTenantContext(claimsR, (tx) =>
        tx.select({ id: migrationStagingRows.id }).from(migrationStagingRows)
          .where(eq(migrationStagingRows.tenantId, tenantR)),
      );
      await withTenantContext(claimsR, (tx) => markValidated(tx, tenantR, row!.id));
      await withTenantContext(claimsR, (tx) =>
        markFailed(tx, tenantR, row!.id, { code: "import_failed", message: "database error, sqlstate 23505" }),
      );

      const summary = await withTenantContext(claimsR, (tx) =>
        importRecords(tx, tenantR, SOURCE_SYSTEM, [rec], res),
      );
      expect(summary.inserted).toBe(1);
      expect(summary.retried).toBe(1);
      expect(summary.skipped).toBe(0);

      const [after] = await withTenantContext(claimsR, (tx) =>
        tx.select({ status: migrationStagingRows.status, detail: migrationStagingRows.errorDetail })
          .from(migrationStagingRows).where(eq(migrationStagingRows.tenantId, tenantR)),
      );
      expect(after!.status).toBe("imported");
      // The retry is RECORDED, not silent.
      expect((after!.detail as { code?: string } | null)?.code).toBe("retried");

      // ...and an already-imported row is NOT retried on the run after that.
      const again = await withTenantContext(claimsR, (tx) =>
        importRecords(tx, tenantR, SOURCE_SYSTEM, [rec], res),
      );
      expect(again.inserted).toBe(0);
      // NOT retried: the row is `imported`, so the retry gate never opens.
      expect(again.retried).toBe(0);
      // SKIPPED, ruled 2026-08-26. It used to take importPatient's UPDATE path
      // on `ledger.importedEntityId` and report `updated`, so a second --apply
      // re-wrote every target row while §7.3 promised zero writes.
      expect(again.updated).toBe(0);
      expect(again.skipped).toBe(1);
    } finally {
      await sql`delete from patient_locations where tenant_id = ${tenantR}`;
      await sql`delete from patients where tenant_id = ${tenantR}`;
      await sql`delete from migration_staging_rows where tenant_id = ${tenantR}`;
      await sql`delete from tenants where id = ${tenantR}`;
    }
  });

  /* ================================================================== *
   * B3: reconcile() RETURNS THE SHAPE THE RUNNER PRINTS                 *
   * ================================================================== *
   * The producer returned byEntityType/byStatus and the reader asked for
   * staged/imported/toReview/failed/referentialIntegrity - so every
   * RECONCILIATION line printed zeros over a populated ledger, and both sides
   * were green because the test doubles asserted the reader's contract. */

  it("the REAL reconcile returns per-entity counts, integrity and number fidelity", async () => {
    const report = await withTenantContext(claimsA, (tx) =>
      generateReconciliationReport(tx, tenantA, batchId),
    );
    for (const k of ["patient", "appointment", "clinical_episode", "clinical_record", "attachment"]) {
      expect(typeof report.staged[k as keyof typeof report.staged]).toBe("number");
      expect(typeof report.imported[k as keyof typeof report.imported]).toBe("number");
      expect(typeof report.failed[k as keyof typeof report.failed]).toBe("number");
    }
    // The batch staged in this suite: staged is non-zero and matches the ledger.
    expect(report.staged.patient).toBeGreaterThan(0);
    expect(report.staged.patient).toBe(report.byEntityType.patient);
    expect(report.imported.patient + report.failed.patient).toBeLessThanOrEqual(report.staged.patient);
    // Computed by query, not assumed.
    expect(report.referentialIntegrity.ok).toBe(true);
    expect(report.referentialIntegrity.problems).toBe(0);
    expect(report.patientNumberFidelity.ok).toBe(true);
    expect(report.patientNumberFidelity.changed).toBe(0);
  });

  /* ================================================================== *
   * B4: AN `imported` ROW IS SKIPPED, FOR EVERY ENTITY, WITH ZERO WRITES *
   * ================================================================== */

  it("the second run SKIPS every entity and writes nothing", async () => {
    // run #1 and run #2 already ran above, so the ledger is fully `imported`.
    const before = await withTenantContext(claimsA, (tx) =>
      tx.select({ id: patients.id, updatedAt: patients.updatedAt }).from(patients)
        .where(eq(patients.tenantId, tenantA)),
    );
    const summary = await withTenantContext(claimsA, (tx) =>
      importRecords(tx, tenantA, SOURCE_SYSTEM, allRows.map((r) => r.record), resolvers),
    );
    expect(summary.inserted).toBe(0);
    // THE ZEROS ARE NOT THE PROOF - an empty batch prints those too. `skipped`
    // carrying the full count is what says every row was found and left alone.
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBeGreaterThan(0);

    const after = await withTenantContext(claimsA, (tx) =>
      tx.select({ id: patients.id, updatedAt: patients.updatedAt }).from(patients)
        .where(eq(patients.tenantId, tenantA)),
    );
    // NOT A COUNT COMPARISON. An UPDATE keeps the count identical and only
    // moves updated_at, which is exactly what this has to catch.
    expect(after.length).toBe(before.length);
    const byId = new Map(before.map((r) => [r.id, r.updatedAt?.toISOString()]));
    for (const row of after) {
      expect(row.updatedAt?.toISOString()).toBe(byId.get(row.id));
    }
  });

  it("a VALIDATED row carrying importedEntityId still takes the UPDATE path", async () => {
    // The one shape that legitimately updates: a row imported earlier, then
    // re-staged and re-validated. Skipping it would strand the change.
    const [row] = await withTenantContext(claimsA, (tx) =>
      tx.select({ id: migrationStagingRows.id, entityId: migrationStagingRows.importedEntityId })
        .from(migrationStagingRows)
        .where(and(
          eq(migrationStagingRows.tenantId, tenantA),
          eq(migrationStagingRows.entityType, "patient"),
          eq(migrationStagingRows.status, "imported"),
        ))
        .limit(1),
    );
    expect(row?.entityId).toBeTruthy();
    // Force it back to `validated` WITHOUT clearing importedEntityId.
    await sql`update migration_staging_rows set status = 'validated'
               where id = ${row!.id} and tenant_id = ${tenantA}`;
    try {
      const target = batch.find((b) => b.record.entityType === "patient")!.record;
      const summary = await withTenantContext(claimsA, (tx) =>
        importRecords(tx, tenantA, SOURCE_SYSTEM, [target], resolvers),
      );
      expect(summary.inserted).toBe(0);
      // The row it matched is the one forced back to `validated`, so it is
      // eligible; every other patient in the batch is still `imported`.
      expect(summary.updated + summary.skipped).toBeGreaterThan(0);
    } finally {
      await sql`update migration_staging_rows set status = 'imported'
                 where id = ${row!.id} and tenant_id = ${tenantA}`;
    }
  });

  it("tenant B sees none of tenant A's staging rows through the same seam", async () => {
    const rows = await withTenantContext(claimsB, (tx) =>
      tx.select({ id: migrationStagingRows.id }).from(migrationStagingRows),
    );
    expect(rows.length).toBe(0);
  });
});
