// packages/db/src/migration/staging.ts
//
// Staging-table primitives for the migration pipeline. Everything here takes a
// DbTx from withTenantContext — the import job runs as an authenticated staff
// principal (admin/owner claims), so migration_staging_rows' tenant-isolation
// RLS applies to every statement. tenant_id is STILL written explicitly on
// every insert (CLAUDE.md rule 3); RLS WITH CHECK is the backstop, not the
// mechanism.
//
// Status machine (mirrors the migration_staging_status enum comment in
// schema.ts):
//
//   pending ──validate──▶ validated ──import──▶ imported   (terminal)
//      │                      │
//      └───────fail──────────┴──▶ failed ──re-stage──▶ pending
//
// Transitions are guarded in the UPDATE's WHERE clause, so a concurrent or
// out-of-order call cannot corrupt state — it throws instead.

import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbTx } from "../client";
import { migrationStagingRows } from "../schema";
import type {
  MigrationEntityType,
  MigrationErrorDetail,
  MigrationStagingStatus,
} from "./types";

/**
 * Pipeline error with a structured, persistable detail. Messages are
 * value-free by contract (field names, codes, statuses — never source data).
 */
export class MigrationStagingError extends Error {
  constructor(
    message: string,
    readonly errorDetail: MigrationErrorDetail,
    readonly context: { stagingRowId?: string; expected?: MigrationStagingStatus[] } = {},
  ) {
    super(message);
    this.name = "MigrationStagingError";
  }
}

export type StageRowInput = {
  sourceSystem: string;
  entityType: MigrationEntityType;
  sourceId: string;
  raw: unknown;
};

/**
 * Land raw source rows in the staging table. Idempotent on the
 * (tenant_id, source_system, entity_type, source_id) unique key:
 *
 *   - new source row            → inserted as `pending`
 *   - re-staged, not imported   → raw/batch refreshed, status reset to
 *                                 `pending`, error cleared (the re-stage path
 *                                 for `failed` rows)
 *   - re-staged, already        → raw/batch refreshed for audit, but status
 *     `imported`                  and imported_entity_id are PRESERVED — the
 *                                 ledger never forgets what it imported.
 */
export type StagedRow = {
  id: string;
  entityType: MigrationEntityType;
  sourceId: string;
};

export async function stageRows(
  tx: DbTx,
  tenantId: string,
  batchId: string,
  rows: StageRowInput[],
): Promise<{ staged: number; rows: StagedRow[] }> {
  if (rows.length === 0) return { staged: 0, rows: [] };

  const inserted = await tx
    .insert(migrationStagingRows)
    .values(
      rows.map((r) => ({
        tenantId,
        batchId,
        sourceSystem: r.sourceSystem,
        entityType: r.entityType,
        sourceId: r.sourceId,
        raw: r.raw,
      })),
    )
    .onConflictDoUpdate({
      target: [
        migrationStagingRows.tenantId,
        migrationStagingRows.sourceSystem,
        migrationStagingRows.entityType,
        migrationStagingRows.sourceId,
      ],
      set: {
        raw: sql`excluded.raw`,
        batchId: sql`excluded.batch_id`,
        status: sql`case when ${migrationStagingRows.status} = 'imported'
                    then 'imported'::migration_staging_status
                    else 'pending'::migration_staging_status end`,
        errorDetail: sql`case when ${migrationStagingRows.status} = 'imported'
                         then ${migrationStagingRows.errorDetail} else null end`,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: migrationStagingRows.id,
      entityType: migrationStagingRows.entityType,
      sourceId: migrationStagingRows.sourceId,
    });

  return { staged: inserted.length, rows: inserted };
}

/** pending → validated. Throws if the row is not currently `pending`. */
export async function markValidated(tx: DbTx, tenantId: string, stagingRowId: string) {
  await transition(tx, tenantId, stagingRowId, ["pending"], { status: "validated" });
}

/**
 * pending|validated → failed, with a structured, PII-free error detail
 * (see MigrationErrorDetail — codes and field names, never source values).
 */
export async function markFailed(
  tx: DbTx,
  tenantId: string,
  stagingRowId: string,
  errorDetail: MigrationErrorDetail,
) {
  await transition(tx, tenantId, stagingRowId, ["pending", "validated"], {
    status: "failed",
    errorDetail,
  });
}

/**
 * validated → imported, recording the created target row's uuid — the ledger
 * entry that makes every later re-run idempotent.
 */
export async function markImported(
  tx: DbTx,
  tenantId: string,
  stagingRowId: string,
  importedEntityId: string,
) {
  await transition(tx, tenantId, stagingRowId, ["validated"], {
    status: "imported",
    importedEntityId,
    errorDetail: null,
  });
}

async function transition(
  tx: DbTx,
  tenantId: string,
  stagingRowId: string,
  expected: MigrationStagingStatus[],
  set: {
    status: MigrationStagingStatus;
    importedEntityId?: string;
    errorDetail?: MigrationErrorDetail | null;
  },
) {
  const updated = await tx
    .update(migrationStagingRows)
    .set(set)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.id, stagingRowId),
        inArray(migrationStagingRows.status, expected),
      ),
    )
    .returning({ id: migrationStagingRows.id });

  if (updated.length === 0) {
    const message = `staging row ${stagingRowId}: cannot transition to '${set.status}' — row missing, out of tenant scope, or not in [${expected.join(", ")}]`;
    throw new MigrationStagingError(
      message,
      { code: "invalid_transition", message },
      { stagingRowId, expected },
    );
  }
}

/**
 * Ledger lookup: source ids → imported target uuids, for resolving
 * cross-record references (e.g. appointment.patientSourceId → patients.id).
 * Only `imported` rows count; a reference to a row that failed or was never
 * staged resolves to nothing and the caller fails that record.
 */
export async function resolveImportedIds(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  entityType: MigrationEntityType,
  sourceIds: string[],
): Promise<Map<string, string>> {
  if (sourceIds.length === 0) return new Map();

  const rows = await tx
    .select({
      sourceId: migrationStagingRows.sourceId,
      importedEntityId: migrationStagingRows.importedEntityId,
    })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.sourceSystem, sourceSystem),
        eq(migrationStagingRows.entityType, entityType),
        eq(migrationStagingRows.status, "imported"),
        inArray(migrationStagingRows.sourceId, sourceIds),
      ),
    );

  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.importedEntityId) map.set(r.sourceId, r.importedEntityId);
  }
  return map;
}

/** Per-status row counts for one batch — the reconciliation-report primitive. */
export async function batchStatusCounts(
  tx: DbTx,
  tenantId: string,
  batchId: string,
): Promise<Record<MigrationStagingStatus, number>> {
  const rows = await tx
    .select({
      status: migrationStagingRows.status,
      count: sql<number>`count(*)::int`,
    })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.batchId, batchId),
      ),
    )
    .groupBy(migrationStagingRows.status);

  const counts: Record<MigrationStagingStatus, number> = {
    pending: 0,
    validated: 0,
    imported: 0,
    failed: 0,
  };
  for (const r of rows) counts[r.status] = r.count;
  return counts;
}
