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
  // `failed` IS IN THE EXPECTED SET so a retry that fails again re-records the
  // reason rather than throwing an invalid-transition over the real cause.
  await transition(tx, tenantId, stagingRowId, ["pending", "validated", "failed"], {
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
  // `errorDetail: null` CLEARS an earlier failure rather than leaving it beside
  // an `imported` status, which would read as a row that imported and failed.
  //
  // IT NO LONGER RECORDS "this one landed on a retry". It took a `retried` flag
  // that wrote a `{ code: "retried" }` detail, for the in-place retry path
  // removed 2026-08-26 - that path was unreachable, because the runner stages
  // before it imports and staging resets a `failed` row to `pending` (see the
  // comment at upsert.ts' failed-row skip). The recovered row is indistinguish-
  // able from a first-time import because that is what it now is: re-staged,
  // re-validated, imported. The evidence a reconciler wants is the PREVIOUS
  // run's transcript, which reports the failure with its code.
  //
  // `failed` STAYS IN THE EXPECTED SET. `importRecords` no longer sends a
  // `failed` row down this path, but a caller that marks one validated by hand
  // still can, and narrowing it would be a behaviour change this does not need.
  await transition(tx, tenantId, stagingRowId, ["validated", "failed"], {
    status: "imported",
    importedEntityId,
    errorDetail: null,
  });
}

/**
 * MANY ROWS, ONE STATEMENT. The bulk half of `markImported`, for the chunked
 * import path (MIG-08).
 *
 * WHY IT EXISTS. `markImported` costs one round trip PER ROW, and at the
 * rehearsal's measured 1.7 rows/s the round trips WERE the import: 2001 rows
 * took 19m30s against a pooler in Frankfurt. A chunk of 200 rows that inserts
 * in one statement and then marks 200 ledger rows in 200 statements has moved
 * the bottleneck rather than removed it.
 *
 * THE TRANSITION GUARD IS KEPT, COLLECTIVELY. `transition` refuses a row that
 * is not in the expected status set and throws; this refuses the whole CHUNK if
 * ANY row was not in `validated|failed`, by comparing the updated count against
 * the input count. That is deliberately stricter than per-row: the caller's
 * answer to a throw here is to roll back to the chunk savepoint and re-import
 * the chunk one row at a time, where each row gets `transition`'s own
 * per-row verdict and its own error detail. So nothing is lost by refusing the
 * batch - the precise reason is recovered by the fallback.
 *
 * `error_detail = null` for the same reason `markImported` clears it: an
 * `imported` row carrying a stale failure detail reads as a row that imported
 * and failed.
 *
 * RAW SQL, and it is the one place in this file that is. `UPDATE ... FROM
 * (VALUES ...)` has no drizzle query-builder form, and the alternative - a
 * CASE-expression update or N statements - is what this function exists to
 * avoid. Every value is a BOUND PARAMETER; nothing is interpolated.
 */
export async function markImportedMany(
  tx: DbTx,
  tenantId: string,
  pairs: Array<{ stagingRowId: string; importedEntityId: string }>,
): Promise<void> {
  if (pairs.length === 0) return;

  const tuples = sql.join(
    pairs.map((p) => sql`(${p.stagingRowId}::uuid, ${p.importedEntityId}::uuid)`),
    sql`, `,
  );
  const result = await tx.execute(sql`
    update migration_staging_rows as m
       set status = 'imported'::migration_staging_status,
           imported_entity_id = v.entity_id,
           error_detail = null,
           updated_at = now()
      from (values ${tuples}) as v(staging_row_id, entity_id)
     where m.id = v.staging_row_id
       and m.tenant_id = ${tenantId}::uuid
       and m.status in ('validated'::migration_staging_status,
                        'failed'::migration_staging_status)
    returning m.id
  `);

  // postgres-js returns an array-like of rows; drizzle passes it through.
  const updated = Array.isArray(result)
    ? result.length
    : ((result as { length?: number }).length ?? 0);
  if (updated !== pairs.length) {
    const message =
      `bulk transition to 'imported' updated ${updated} of ${pairs.length} staging row(s) — ` +
      `at least one was missing, out of tenant scope, or not in [validated, failed]`;
    throw new MigrationStagingError(message, { code: "invalid_transition", message });
  }
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
