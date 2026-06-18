/**
 * migration-reconciliation.test.ts
 *
 * Tests for packages/db/src/migration/reconciliation.ts.
 *
 * Pure tests (no DB): reportToJson and reportToMarkdown output shape.
 * Live-DB tests: generateReconciliationReport queries. Skipped when
 * DATABASE_URL is absent.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  generateReconciliationReport,
  reportToJson,
  reportToMarkdown,
  type ReconciliationReport,
} from "../src/migration/reconciliation";
import {
  markFailed,
  markImported,
  markValidated,
  stageRows,
  withTenantContext,
  type TenantClaims,
} from "../index";
import { connect, live } from "./rls-harness";

// ────────────────────────────────────────────────────────────────────────────
// Pure fixtures
// ────────────────────────────────────────────────────────────────────────────

const sampleReport = (): ReconciliationReport => ({
  batchId: "00000000-0000-0000-0000-000000000001",
  generatedAt: "2026-01-15T10:00:00.000Z",
  totalRows: 5,
  byEntityType: {
    patient: 2,
    appointment: 2,
    clinical_episode: 1,
    clinical_record: 0,
    attachment: 0,
  },
  byStatus: { pending: 0, validated: 0, imported: 4, failed: 1 },
  failedRows: [
    {
      sourceId: "fz-apt-orphan",
      entityType: "appointment",
      errorCode: "unresolved_reference",
      fields: ["patientSourceId"],
    },
  ],
  importedCount: 4,
  pendingCount: 0,
});

// ────────────────────────────────────────────────────────────────────────────
// Pure tests — no DB required
// ────────────────────────────────────────────────────────────────────────────

describe("reportToJson — structured JSON output", () => {
  it("returns valid JSON with expected top-level keys", () => {
    const parsed = JSON.parse(reportToJson(sampleReport())) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      batchId: expect.any(String),
      generatedAt: expect.any(String),
      totalRows: 5,
      importedCount: 4,
      pendingCount: 0,
    });
  });

  it("includes byEntityType counts", () => {
    const parsed = JSON.parse(reportToJson(sampleReport())) as {
      byEntityType: Record<string, number>;
    };
    expect(parsed.byEntityType.patient).toBe(2);
    expect(parsed.byEntityType.appointment).toBe(2);
    expect(parsed.byEntityType.clinical_episode).toBe(1);
  });

  it("includes byStatus counts", () => {
    const parsed = JSON.parse(reportToJson(sampleReport())) as {
      byStatus: Record<string, number>;
    };
    expect(parsed.byStatus.imported).toBe(4);
    expect(parsed.byStatus.failed).toBe(1);
    expect(parsed.byStatus.pending).toBe(0);
  });

  it("includes failedRows with sourceId, entityType, errorCode, and fields", () => {
    const parsed = JSON.parse(reportToJson(sampleReport())) as {
      failedRows: Record<string, unknown>[];
    };
    expect(parsed.failedRows).toHaveLength(1);
    expect(parsed.failedRows[0]).toMatchObject({
      sourceId: "fz-apt-orphan",
      entityType: "appointment",
      errorCode: "unresolved_reference",
      fields: ["patientSourceId"],
    });
  });

  it("failedRows contain field names only, never field values (PII-free)", () => {
    const json = reportToJson(sampleReport());
    expect(json).not.toMatch(/patientName|email|phone|nif/i);
    expect(json).not.toMatch(/data value/i);
  });

  it("roundtrips: JSON.parse(reportToJson(r)) equals original report", () => {
    const r = sampleReport();
    const parsed = JSON.parse(reportToJson(r)) as ReconciliationReport;
    expect(parsed.batchId).toBe(r.batchId);
    expect(parsed.totalRows).toBe(r.totalRows);
    expect(parsed.failedRows).toHaveLength(r.failedRows.length);
  });
});

describe("reportToMarkdown — human-readable output", () => {
  it("includes the batch id", () => {
    const md = reportToMarkdown(sampleReport());
    expect(md).toContain("00000000-0000-0000-0000-000000000001");
  });

  it("includes the generated timestamp", () => {
    const md = reportToMarkdown(sampleReport());
    expect(md).toContain("2026-01-15T10:00:00.000Z");
  });

  it("includes totalRows in the summary table", () => {
    const md = reportToMarkdown(sampleReport());
    expect(md).toContain("Total rows");
    expect(md).toContain("5");
  });

  it("includes imported and pending counts", () => {
    const md = reportToMarkdown(sampleReport());
    expect(md).toContain("Imported");
    expect(md).toContain("4");
    expect(md).toContain("Pending");
    expect(md).toContain("0");
  });

  it("lists all entity types in the by-entity section", () => {
    const md = reportToMarkdown(sampleReport());
    expect(md).toContain("patient: 2");
    expect(md).toContain("appointment: 2");
    expect(md).toContain("clinical_episode: 1");
  });

  it("renders failed row with sourceId, errorCode, and fields", () => {
    const md = reportToMarkdown(sampleReport());
    expect(md).toContain("fz-apt-orphan");
    expect(md).toContain("unresolved_reference");
    expect(md).toContain("patientSourceId");
  });

  it("renders 'No failed rows' when failedRows is empty", () => {
    const r: ReconciliationReport = {
      ...sampleReport(),
      failedRows: [],
      byStatus: { ...sampleReport().byStatus, failed: 0, imported: 5 },
    };
    expect(reportToMarkdown(r)).toContain("No failed rows");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Live-DB tests — requires DATABASE_URL
// ────────────────────────────────────────────────────────────────────────────

describe.skipIf(!live)("generateReconciliationReport (live DB)", () => {
  let sql: Sql;
  const tenantId = randomUUID();
  const batchId = randomUUID();
  const sourceSystem = "fisiozero";
  const claims: TenantClaims = { tenant_id: tenantId, user_role: "admin" };

  // Scenario: 1 patient (imported), 1 appointment (failed), 1 episode (pending)
  let patRowId: string;
  let aptRowId: string;

  beforeAll(async () => {
    sql = connect();
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantId}, 'Reconciliation Test', ${`rec-${tenantId}`})
    `;

    const staged = await withTenantContext(claims, (tx) =>
      stageRows(tx, tenantId, batchId, [
        { sourceSystem, entityType: "patient", sourceId: "r-pat-001", raw: {} },
        { sourceSystem, entityType: "appointment", sourceId: "r-apt-001", raw: {} },
        { sourceSystem, entityType: "clinical_episode", sourceId: "r-epi-001", raw: {} },
      ]),
    );
    const bySourceId = Object.fromEntries(staged.rows.map((r) => [r.sourceId, r]));
    patRowId = bySourceId["r-pat-001"]!.id;
    aptRowId = bySourceId["r-apt-001"]!.id;

    await withTenantContext(claims, async (tx) => {
      await markValidated(tx, tenantId, patRowId);
      await markFailed(tx, tenantId, aptRowId, {
        code: "unresolved_reference",
        message: "orphan appointment",
        fields: ["patientSourceId"],
      });
      // r-epi-001 stays pending
    });

    await withTenantContext(claims, async (tx) => {
      await markImported(tx, tenantId, patRowId, randomUUID());
    });
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from migration_staging_rows where tenant_id = ${tenantId}`;
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();
  });

  it("returns correct totalRows", async () => {
    const report = await withTenantContext(claims, (tx) =>
      generateReconciliationReport(tx, tenantId, batchId),
    );
    expect(report.totalRows).toBe(3);
  });

  it("returns correct byStatus counts", async () => {
    const report = await withTenantContext(claims, (tx) =>
      generateReconciliationReport(tx, tenantId, batchId),
    );
    expect(report.byStatus).toMatchObject({ imported: 1, failed: 1, pending: 1, validated: 0 });
    expect(report.importedCount).toBe(1);
    expect(report.pendingCount).toBe(1);
  });

  it("returns correct byEntityType counts", async () => {
    const report = await withTenantContext(claims, (tx) =>
      generateReconciliationReport(tx, tenantId, batchId),
    );
    expect(report.byEntityType.patient).toBe(1);
    expect(report.byEntityType.appointment).toBe(1);
    expect(report.byEntityType.clinical_episode).toBe(1);
    expect(report.byEntityType.clinical_record).toBe(0);
  });

  it("returns the failed row with correct errorCode and fields", async () => {
    const report = await withTenantContext(claims, (tx) =>
      generateReconciliationReport(tx, tenantId, batchId),
    );
    expect(report.failedRows).toHaveLength(1);
    expect(report.failedRows[0]).toMatchObject({
      sourceId: "r-apt-001",
      entityType: "appointment",
      errorCode: "unresolved_reference",
      fields: ["patientSourceId"],
    });
  });

  it("failedRows sourceId is an opaque key, not a PII field value", async () => {
    const report = await withTenantContext(claims, (tx) =>
      generateReconciliationReport(tx, tenantId, batchId),
    );
    const json = JSON.stringify(report.failedRows);
    // Source IDs are synthetic keys; error details contain field names only
    expect(json).not.toMatch(/patientName|email|phone|nif/i);
  });

  it("batchId in the report matches the requested batch", async () => {
    const report = await withTenantContext(claims, (tx) =>
      generateReconciliationReport(tx, tenantId, batchId),
    );
    expect(report.batchId).toBe(batchId);
  });
});
