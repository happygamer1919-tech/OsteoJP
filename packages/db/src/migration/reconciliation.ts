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

/** Per-entity counters, keyed the way the runner prints them. */
export type ReconciliationPerEntity = Record<MigrationEntityType, number>;

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

  /* ------------------------------------------------------------------ *
   * THE SHAPE THE RUNNER PRINTS.
   * ------------------------------------------------------------------ *
   * These four existed only in run-import.mjs's reader and in two test
   * doubles until 2026-08-26. The producer returned `byEntityType`/`byStatus`
   * and nothing else, so every RECONCILIATION line printed `staged=0
   * imported=0 to_review=0` over a populated ledger and the integrity line -
   * guarded by `if (report.referentialIntegrity)` - never printed at all.
   * Both sides were green because the doubles asserted the reader against a
   * contract the producer never honoured. */

  /** Rows in the batch, per entity. Every ledger row was staged. */
  staged: ReconciliationPerEntity;
  /** Rows in the batch that reached `imported`, per entity. */
  imported: ReconciliationPerEntity;
  /** Rows the adapter never staged, per entity. Always 0 from the ledger. */
  toReview: ReconciliationPerEntity;
  /** Rows in the batch still `failed`, per entity. */
  failed: ReconciliationPerEntity;
  /** Children in this batch whose parent row is absent from the target tables. */
  referentialIntegrity: {
    ok: boolean;
    problems: number;
    byEntityType: ReconciliationPerEntity;
  };
  /**
   * Did every vendor-supplied `numero_paciente` survive verbatim?
   *
   * OWNER RULING 2026-08-24 makes the vendor number authoritative, and nothing
   * downstream re-checks it: the 0029 trigger fills only NULLs, so a changed
   * number is silent. `changed` counts imported patients whose staged `raw`
   * carried a number and whose persisted `patient_number` differs from it.
   */
  patientNumberFidelity: {
    ok: boolean;
    checked: number;
    changed: number;
  };
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

  /* -------- per-entity staged / imported / failed, from THIS batch -------- */
  const perEntityRows = await tx
    .select({
      entityType: migrationStagingRows.entityType,
      status: migrationStagingRows.status,
      count: sql<number>`count(*)::int`,
    })
    .from(migrationStagingRows)
    .where(scope)
    .groupBy(migrationStagingRows.entityType, migrationStagingRows.status);

  const zero = (): ReconciliationPerEntity => ({
    patient: 0,
    appointment: 0,
    clinical_episode: 0,
    clinical_record: 0,
    attachment: 0,
  });
  const staged = zero();
  const imported = zero();
  const failed = zero();
  for (const r of perEntityRows) {
    staged[r.entityType] += r.count;
    if (r.status === "imported") imported[r.entityType] += r.count;
    if (r.status === "failed") failed[r.entityType] += r.count;
  }

  /* -------- referential integrity, by query -------- *
   * A CHILD WHOSE PARENT IS ABSENT FROM THE TARGET TABLE. Not a ledger check:
   * the ledger can say `imported` over a row that is no longer there, and that
   * disagreement is exactly what this exists to surface. */
  const integrity = await tx.execute(sql`
    with batch as (
      select entity_type, imported_entity_id
        from ${migrationStagingRows}
       where tenant_id = ${tenantId}
         and batch_id = ${batchId}
         and status = 'imported'
         and imported_entity_id is not null
    )
    select 'appointment'::text      as entity, count(*)::int as n
      from batch b join public.appointments      c on c.id = b.imported_entity_id
     where b.entity_type = 'appointment'
       and not exists (select 1 from public.patients p where p.id = c.patient_id)
    union all
    select 'clinical_episode', count(*)::int
      from batch b join public.clinical_episodes c on c.id = b.imported_entity_id
     where b.entity_type = 'clinical_episode'
       and not exists (select 1 from public.patients p where p.id = c.patient_id)
    union all
    select 'clinical_record', count(*)::int
      from batch b join public.clinical_records  c on c.id = b.imported_entity_id
     where b.entity_type = 'clinical_record'
       and not exists (select 1 from public.patients p where p.id = c.patient_id)
    union all
    select 'attachment', count(*)::int
      from batch b join public.attachments       c on c.id = b.imported_entity_id
     where b.entity_type = 'attachment'
       and c.patient_id is not null
       and not exists (select 1 from public.patients p where p.id = c.patient_id)
  `);
  const integrityByEntity = zero();
  let problems = 0;
  for (const row of integrity as unknown as Array<{ entity: string; n: number }>) {
    const n = Number(row.n) || 0;
    integrityByEntity[row.entity as MigrationEntityType] = n;
    problems += n;
  }

  /* -------- patient-number fidelity -------- *
   * The vendor number is authoritative (owner ruling 2026-08-24) and NOTHING
   * else re-checks it: 0029 fills only NULLs, so a number that changed changed
   * silently. `raw->>'numero_paciente'` is the vendor's own cell, compared as
   * an integer against what persisted. */
  const fidelity = await tx.execute(sql`
    select count(*)::int as checked,
           count(*) filter (
             where p.patient_number is distinct from
                   nullif(regexp_replace(s.raw->>'numero_paciente', '\s', '', 'g'), '')::int
           )::int as changed
      from ${migrationStagingRows} s
      join public.patients p on p.id = s.imported_entity_id
     where s.tenant_id = ${tenantId}
       and s.batch_id = ${batchId}
       and s.entity_type = 'patient'
       and s.status = 'imported'
       and nullif(regexp_replace(coalesce(s.raw->>'numero_paciente', ''), '\s', '', 'g'), '') is not null
  `);
  const fid = (fidelity as unknown as Array<{ checked: number; changed: number }>)[0] ?? {
    checked: 0,
    changed: 0,
  };

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
    staged,
    imported,
    // Rows routed to review are never staged, so the LEDGER can only ever
    // report 0. Kept in the shape because the runner prints the column and a
    // missing key would silently read as 0 anyway - this way it is deliberate.
    toReview: zero(),
    failed,
    referentialIntegrity: { ok: problems === 0, problems, byEntityType: integrityByEntity },
    patientNumberFidelity: {
      ok: Number(fid.changed) === 0,
      checked: Number(fid.checked) || 0,
      changed: Number(fid.changed) || 0,
    },
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
