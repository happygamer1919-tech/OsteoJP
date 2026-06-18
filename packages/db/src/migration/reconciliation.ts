// packages/db/src/migration/reconciliation.ts
//
// Per-batch reconciliation report: queries migration_staging_rows and produces
// a structured JSON report and a human-readable markdown summary.
//
// Read-only — no mutations. Callers wrap in withTenantContext so the RLS on
// migration_staging_rows scopes all queries to the authenticated tenant.
// tenant_id is ALSO passed explicitly (CLAUDE.md rule 3).

import { and, asc, eq, sql } from "drizzle-orm";

import type { DbTx } from "../client";
import { migrationStagingRows } from "../schema";
import type { MigrationEntityType, MigrationErrorDetail, MigrationStagingStatus } from "./types";

export type ReconciliationFailedRow = {
  sourceId: string;
  entityType: MigrationEntityType;
  errorCode: MigrationErrorDetail["code"];
  fields?: string[];
};

export type ReconciliationReport = {
  batchId: string;
  /** ISO UTC timestamp when the report was generated. */
  generatedAt: string;
  totalRows: number;
  byEntityType: Record<MigrationEntityType, number>;
  byStatus: Record<MigrationStagingStatus, number>;
  /** PII-free: sourceId is an opaque key; errorCode and fields name the problem. */
  failedRows: ReconciliationFailedRow[];
  /** Rows that reached `imported` — the "done" count. */
  importedCount: number;
  /** Rows still in `pending` — outstanding work or a stalled batch. */
  pendingCount: number;
};

/**
 * Generate a reconciliation report for one batch.
 * Runs three DB queries: status counts, entity-type counts, failed row list.
 */
export async function generateReconciliationReport(
  tx: DbTx,
  tenantId: string,
  batchId: string,
): Promise<ReconciliationReport> {
  const scope = and(
    eq(migrationStagingRows.tenantId, tenantId),
    eq(migrationStagingRows.batchId, batchId),
  );

  const statusRows = await tx
    .select({
      status: migrationStagingRows.status,
      count: sql<number>`count(*)::int`,
    })
    .from(migrationStagingRows)
    .where(scope)
    .groupBy(migrationStagingRows.status);

  const byStatus: Record<MigrationStagingStatus, number> = {
    pending: 0,
    validated: 0,
    imported: 0,
    failed: 0,
  };
  for (const r of statusRows) byStatus[r.status] = r.count;

  const entityRows = await tx
    .select({
      entityType: migrationStagingRows.entityType,
      count: sql<number>`count(*)::int`,
    })
    .from(migrationStagingRows)
    .where(scope)
    .groupBy(migrationStagingRows.entityType);

  const byEntityType: Record<MigrationEntityType, number> = {
    patient: 0,
    appointment: 0,
    clinical_episode: 0,
    clinical_record: 0,
    attachment: 0,
  };
  for (const r of entityRows) byEntityType[r.entityType] = r.count;

  const failedRows = await tx
    .select({
      sourceId: migrationStagingRows.sourceId,
      entityType: migrationStagingRows.entityType,
      errorDetail: migrationStagingRows.errorDetail,
    })
    .from(migrationStagingRows)
    .where(and(scope, eq(migrationStagingRows.status, "failed")))
    .orderBy(asc(migrationStagingRows.createdAt));

  const totalRows = Object.values(byStatus).reduce((s, n) => s + n, 0);

  return {
    batchId,
    generatedAt: new Date().toISOString(),
    totalRows,
    byEntityType,
    byStatus,
    failedRows: failedRows.map((r) => {
      const d = r.errorDetail as { code?: string; fields?: string[] } | null;
      return {
        sourceId: r.sourceId,
        entityType: r.entityType,
        errorCode: (d?.code ?? "import_failed") as MigrationErrorDetail["code"],
        ...(d?.fields ? { fields: d.fields } : {}),
      };
    }),
    importedCount: byStatus.imported,
    pendingCount: byStatus.pending,
  };
}

/** Serialize a report as a formatted JSON string. */
export function reportToJson(report: ReconciliationReport): string {
  return JSON.stringify(report, null, 2);
}

/** Render a report as a human-readable markdown document. */
export function reportToMarkdown(report: ReconciliationReport): string {
  const { batchId, generatedAt, totalRows, byEntityType, byStatus, failedRows } = report;

  const lines: string[] = [
    "# Migration Reconciliation Report",
    "",
    `**Batch:** \`${batchId}\``,
    `**Generated:** ${generatedAt}`,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "|---|---|",
    `| Total rows | ${totalRows} |`,
    `| Imported | ${byStatus.imported} |`,
    `| Pending | ${byStatus.pending} |`,
    `| Validated | ${byStatus.validated} |`,
    `| Failed | ${byStatus.failed} |`,
    "",
    "## By Entity Type",
    "",
  ];

  for (const [type, n] of Object.entries(byEntityType)) {
    lines.push(`- ${type}: ${n}`);
  }

  lines.push("", `## Failed Rows (${failedRows.length})`, "");

  if (failedRows.length === 0) {
    lines.push("_No failed rows._");
  } else {
    lines.push("| sourceId | entityType | errorCode | fields |");
    lines.push("|---|---|---|---|");
    for (const r of failedRows) {
      lines.push(
        `| ${r.sourceId} | ${r.entityType} | ${r.errorCode} | ${(r.fields ?? []).join(", ")} |`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
