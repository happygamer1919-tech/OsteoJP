// packages/db/src/migration/health.ts
//
// Read-only health dashboard queries for the migration pipeline. Intended for
// the admin UI (apps/admin). All functions take a DbTx from withTenantContext
// so RLS applies automatically; tenantId is also passed explicitly (CLAUDE.md
// rule 3 — never rely on RLS alone to scope writes or reads).
//
// No mutations here. These are safe to call in a read-only transaction or
// alongside other queries in a single withTenantContext block.

import { and, eq, sql } from "drizzle-orm";

import type { DbTx } from "../client";
import { migrationStagingRows } from "../schema";
import type { MigrationStagingStatus } from "./types";

/** Total patient rows that reached `imported` status for this tenant. */
export async function totalPatientsMigrated(tx: DbTx, tenantId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.entityType, "patient"),
        eq(migrationStagingRows.status, "imported"),
      ),
    );
  return row?.count ?? 0;
}

/** Total appointment rows that reached `imported` status for this tenant. */
export async function totalAppointmentsMigrated(tx: DbTx, tenantId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.entityType, "appointment"),
        eq(migrationStagingRows.status, "imported"),
      ),
    );
  return row?.count ?? 0;
}

export type BatchSummaryEntry = {
  batchId: string;
  /** Timestamp of the most recently updated row in this batch. */
  lastUpdatedAt: Date;
  counts: Record<MigrationStagingStatus, number>;
};

/**
 * Last 5 batches (ordered by most-recently-updated row) with per-status counts.
 * Useful for spotting stalled or partially failed batches at a glance.
 */
export async function batchSummary(tx: DbTx, tenantId: string): Promise<BatchSummaryEntry[]> {
  const raw = await tx
    .select({
      batchId: migrationStagingRows.batchId,
      status: migrationStagingRows.status,
      count: sql<number>`count(*)::int`,
      lastUpdatedAt: sql<Date>`max(${migrationStagingRows.updatedAt})`,
    })
    .from(migrationStagingRows)
    .where(eq(migrationStagingRows.tenantId, tenantId))
    .groupBy(migrationStagingRows.batchId, migrationStagingRows.status);

  // Pivot: batchId → { lastUpdatedAt, counts }
  const batches = new Map<
    string,
    { lastUpdatedAt: Date; counts: Record<MigrationStagingStatus, number> }
  >();

  for (const r of raw) {
    if (!batches.has(r.batchId)) {
      batches.set(r.batchId, {
        lastUpdatedAt: new Date(r.lastUpdatedAt),
        counts: { pending: 0, validated: 0, imported: 0, failed: 0 },
      });
    }
    const entry = batches.get(r.batchId)!;
    entry.counts[r.status] = r.count;
    const rowUpdatedAt = new Date(r.lastUpdatedAt);
    if (rowUpdatedAt > entry.lastUpdatedAt) entry.lastUpdatedAt = rowUpdatedAt;
  }

  return [...batches.entries()]
    .sort(([, a], [, b]) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime())
    .slice(0, 5)
    .map(([batchId, entry]) => ({ batchId, ...entry }));
}

/**
 * Count of rows currently in `failed` status across all batches for this
 * tenant. Non-zero means there are failures not yet re-staged — human
 * attention required before the next import run.
 */
export async function pendingFailures(tx: DbTx, tenantId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.status, "failed"),
      ),
    );
  return row?.count ?? 0;
}
