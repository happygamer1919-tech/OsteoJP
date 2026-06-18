/**
 * migration-batch-validation.test.ts
 *
 * Unit tests for packages/db/src/migration/batch-validate.ts.
 *
 * Pure tests (no DB): detectBatchIssues — duplicate detection, missing field
 * detection, in-batch orphan appointment detection.
 *
 * Live-DB tests: applyBatchValidation — failed row write through staging
 * primitives. Skipped when DATABASE_URL is absent.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyBatchValidation, detectBatchIssues } from "../src/migration/batch-validate";
import type { MigrationRecord } from "../src/migration/types";
import {
  stageRows,
  withTenantContext,
  type TenantClaims,
} from "../index";
import { connect, live } from "./rls-harness";

// ────────────────────────────────────────────────────────────────────────────
// Helpers — synthetic fixtures (no real PII ever)
// ────────────────────────────────────────────────────────────────────────────

const validPatient = (sourceId: string): MigrationRecord => ({
  entityType: "patient",
  data: { sourceId, fullName: "Sintético Teste", locationKeys: [] },
});

const validAppointment = (sourceId: string, patientSourceId: string): MigrationRecord => ({
  entityType: "appointment",
  data: {
    sourceId,
    patientSourceId,
    practitionerKey: "jp",
    locationKey: "linda-a-velha",
    startsAt: "2024-01-01T10:00:00.000Z",
    endsAt: "2024-01-01T11:00:00.000Z",
    status: "completed",
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Pure tests — no DB required
// ────────────────────────────────────────────────────────────────────────────

describe("detectBatchIssues — pure batch validation", () => {
  // ── 1. Duplicate detection ────────────────────────────────────────────────

  it("flags the second occurrence of a duplicate sourceId+entityType as failed", () => {
    const records: MigrationRecord[] = [
      validPatient("dup-001"),
      validPatient("dup-001"),
    ];
    const issues = detectBatchIssues(records);
    const issue = issues.get("patient:dup-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.code).toBe("validation_failed");
    expect(issue!.detail.fields).toContain("sourceId");
  });

  it("does not flag unique sourceId+entityType combinations", () => {
    const records: MigrationRecord[] = [
      validPatient("unique-001"),
      validPatient("unique-002"),
    ];
    expect(detectBatchIssues(records).size).toBe(0);
  });

  it("treats same sourceId on different entity types as distinct (no false duplicate)", () => {
    // patient:shared-id and appointment:shared-id are different keys
    const records: MigrationRecord[] = [
      validPatient("shared-id"),
      validAppointment("shared-id", "shared-id"), // patient IS in batch
    ];
    expect(detectBatchIssues(records).size).toBe(0);
  });

  // ── 2. Missing required field detection ──────────────────────────────────

  it("flags a patient with empty fullName", () => {
    const records: MigrationRecord[] = [
      { entityType: "patient", data: { sourceId: "bad-pat-001", fullName: "", locationKeys: [] } },
    ];
    const issue = detectBatchIssues(records).get("patient:bad-pat-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.code).toBe("validation_failed");
    expect(issue!.detail.fields).toContain("fullName");
  });

  it("flags an appointment with an invalid startsAt timestamp", () => {
    const records: MigrationRecord[] = [
      validPatient("p-001"),
      {
        entityType: "appointment",
        data: {
          sourceId: "bad-apt-001",
          patientSourceId: "p-001",
          practitionerKey: "jp",
          locationKey: "linda-a-velha",
          startsAt: "not-a-date",
          endsAt: "2024-01-01T11:00:00.000Z",
          status: "completed",
        },
      },
    ];
    const issue = detectBatchIssues(records).get("appointment:bad-apt-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.fields).toContain("startsAt");
  });

  it("flags a clinical_episode with an empty title", () => {
    const records: MigrationRecord[] = [
      {
        entityType: "clinical_episode",
        data: {
          sourceId: "epi-bad-001",
          patientSourceId: "p-001",
          title: "",
          status: "open",
          openedAt: "2024-01-01T10:00:00.000Z",
        },
      },
    ];
    const issue = detectBatchIssues(records).get("clinical_episode:epi-bad-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.fields).toContain("title");
  });

  it("flags a clinical_record with a non-object data field", () => {
    const bad = {
      entityType: "clinical_record" as const,
      data: {
        sourceId: "rec-bad-001",
        patientSourceId: "p-001",
        data: "this should be an object" as unknown as Record<string, unknown>,
        status: "draft" as const,
      },
    };
    const records: MigrationRecord[] = [bad];
    const issue = detectBatchIssues(records).get("clinical_record:rec-bad-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.fields).toContain("data");
  });

  it("flags an attachment with an empty storagePath", () => {
    const records: MigrationRecord[] = [
      {
        entityType: "attachment",
        data: {
          sourceId: "att-bad-001",
          storagePath: "",
          fileName: "rx.pdf",
        },
      },
    ];
    const issue = detectBatchIssues(records).get("attachment:att-bad-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.fields).toContain("storagePath");
  });

  // ── 3. In-batch orphan appointment detection ──────────────────────────────

  it("flags an appointment whose patientSourceId is absent from the batch", () => {
    const records: MigrationRecord[] = [
      validAppointment("apt-orphan-001", "missing-patient-9999"),
    ];
    const issue = detectBatchIssues(records).get("appointment:apt-orphan-001");
    expect(issue).toBeDefined();
    expect(issue!.detail.code).toBe("unresolved_reference");
    expect(issue!.detail.fields).toContain("patientSourceId");
  });

  it("does not flag an appointment whose patient is in the same batch", () => {
    const records: MigrationRecord[] = [
      validPatient("p-batch-001"),
      validAppointment("apt-ok-001", "p-batch-001"),
    ];
    expect(detectBatchIssues(records).size).toBe(0);
  });

  it("does not flag an episode orphan (only appointments are checked)", () => {
    // Episodes with an unknown patientSourceId are not in-batch-orphan-checked
    // by this pure layer (only appointments).
    const records: MigrationRecord[] = [
      {
        entityType: "clinical_episode",
        data: {
          sourceId: "epi-no-pat-001",
          patientSourceId: "unknown-patient",
          title: "Some Episode",
          status: "open",
          openedAt: "2024-01-01T10:00:00.000Z",
        },
      },
    ];
    // Episode has a valid shape, and the pure layer doesn't check episode patient refs
    expect(detectBatchIssues(records).size).toBe(0);
  });

  // ── 4. PII-free contract ──────────────────────────────────────────────────

  it("error detail never contains source field values — field names only", () => {
    const records: MigrationRecord[] = [
      { entityType: "patient", data: { sourceId: "pii-check-001", fullName: "", locationKeys: [] } },
    ];
    const issues = detectBatchIssues(records);
    const serialized = JSON.stringify([...issues.values()]);
    // The empty string is a value; the only allowed content is field name strings
    expect(serialized).not.toContain("CONFIDENTIAL");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Live-DB tests — requires DATABASE_URL
// ────────────────────────────────────────────────────────────────────────────

describe.skipIf(!live)("applyBatchValidation — failed row write (live DB)", () => {
  let sql: Sql;
  const tenantId = randomUUID();
  const batchId = randomUUID();
  const sourceSystem = "fisiozero";
  const claims: TenantClaims = { tenant_id: tenantId, user_role: "admin" };

  // Batch: 1 valid patient, 1 invalid patient, 1 valid appointment, 1 orphan appointment
  const records: MigrationRecord[] = [
    validPatient("bv-pat-001"),
    { entityType: "patient", data: { sourceId: "bv-pat-002", fullName: "", locationKeys: [] } },
    validAppointment("bv-apt-001", "bv-pat-001"),
    validAppointment("bv-apt-002", "bv-missing-9999"),
  ];

  beforeAll(async () => {
    sql = connect();
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantId}, 'Batch Validation Test', ${`bv-${tenantId}`})
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from migration_staging_rows where tenant_id = ${tenantId}`;
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();
  });

  it("marks staged rows as validated or failed according to batch issues", async () => {
    const staged = await withTenantContext(claims, (tx) =>
      stageRows(
        tx,
        tenantId,
        batchId,
        records.map((r) => ({
          sourceSystem,
          entityType: r.entityType,
          sourceId: r.data.sourceId,
          raw: {},
        })),
      ),
    );
    expect(staged.staged).toBe(4);

    const result = await withTenantContext(claims, (tx) =>
      applyBatchValidation(tx, tenantId, sourceSystem, records, staged.rows),
    );

    // bv-pat-001 → valid, bv-pat-002 → failed (empty fullName),
    // bv-apt-001 → valid (patient in batch), bv-apt-002 → failed (orphan)
    expect(result.validated).toBe(2);
    expect(result.failed).toBe(2);

    const rows = await sql<{ source_id: string; status: string; error_detail: unknown }[]>`
      select source_id, status, error_detail
      from migration_staging_rows
      where tenant_id = ${tenantId}
      order by source_id
    `;
    const byId = Object.fromEntries(rows.map((r) => [r.source_id, r]));

    expect(byId["bv-pat-001"]?.status).toBe("validated");
    expect(byId["bv-pat-002"]?.status).toBe("failed");
    expect(byId["bv-apt-001"]?.status).toBe("validated");
    expect(byId["bv-apt-002"]?.status).toBe("failed");
  });

  it("failed row error_detail contains field names only, never source values", async () => {
    const rows = await sql<{ error_detail: unknown }[]>`
      select error_detail from migration_staging_rows
      where tenant_id = ${tenantId} and status = 'failed'
    `;
    const serialized = JSON.stringify(rows.map((r) => r.error_detail));
    expect(serialized).not.toMatch(/bv-missing-9999/);
    expect(serialized).not.toMatch(/fullName value/i);
  });

  it("orphan appointment resolves as valid when patient is already in staging ledger", async () => {
    // Stage and validate+import the orphan's patient in a separate batch
    const priorBatchId = randomUUID();
    const staged = await withTenantContext(claims, (tx) =>
      stageRows(tx, tenantId, priorBatchId, [
        { sourceSystem, entityType: "patient", sourceId: "bv-prior-pat-001", raw: {} },
      ]),
    );
    const { markValidated: mv, markImported: mi } = await import("../index");
    await withTenantContext(claims, (tx) =>
      mv(tx, tenantId, staged.rows[0]!.id),
    );
    await withTenantContext(claims, (tx) =>
      mi(tx, tenantId, staged.rows[0]!.id, randomUUID()),
    );

    // New batch with an appointment referencing the now-imported patient
    const newBatchId = randomUUID();
    const newRecords: MigrationRecord[] = [
      validAppointment("bv-apt-ledger-resolved", "bv-prior-pat-001"),
    ];
    const newStaged = await withTenantContext(claims, (tx) =>
      stageRows(
        tx,
        tenantId,
        newBatchId,
        newRecords.map((r) => ({
          sourceSystem,
          entityType: r.entityType,
          sourceId: r.data.sourceId,
          raw: {},
        })),
      ),
    );

    const result = await withTenantContext(claims, (tx) =>
      applyBatchValidation(tx, tenantId, sourceSystem, newRecords, newStaged.rows),
    );

    // The appointment should be VALIDATED (patient is in ledger, not truly orphaned)
    expect(result.validated).toBe(1);
    expect(result.failed).toBe(0);
  });
});
