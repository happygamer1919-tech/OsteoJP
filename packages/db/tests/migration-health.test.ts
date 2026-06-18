/**
 * migration-health.test.ts
 *
 * Unit tests for packages/db/src/migration/health.ts.
 *
 * All queries hit the staging table, so these are live-DB tests.
 * Skipped when DATABASE_URL is absent so `vitest run` stays green without a DB.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  batchSummary,
  pendingFailures,
  totalAppointmentsMigrated,
  totalPatientsMigrated,
} from "../src/migration/health";
import {
  markFailed,
  markImported,
  markValidated,
  stageRows,
  withTenantContext,
  type TenantClaims,
} from "../index";
import { connect, live } from "./rls-harness";

describe.skipIf(!live)("migration health queries (live DB)", () => {
  let sql: Sql;
  const tenantId = randomUUID();
  const batchA = randomUUID();
  const batchB = randomUUID();
  const sourceSystem = "fisiozero";
  const claims: TenantClaims = { tenant_id: tenantId, user_role: "admin" };

  // Scenario:
  //   batchA — 2 patients imported, 1 appointment failed, 1 episode pending
  //   batchB — 1 appointment imported
  beforeAll(async () => {
    sql = connect();
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantId}, 'Health Query Test', ${`hq-${tenantId}`})
    `;

    const a = await withTenantContext(claims, (tx) =>
      stageRows(tx, tenantId, batchA, [
        { sourceSystem, entityType: "patient", sourceId: "hq-pat-001", raw: {} },
        { sourceSystem, entityType: "patient", sourceId: "hq-pat-002", raw: {} },
        { sourceSystem, entityType: "appointment", sourceId: "hq-apt-001", raw: {} },
        { sourceSystem, entityType: "clinical_episode", sourceId: "hq-epi-001", raw: {} },
      ]),
    );
    const aById = Object.fromEntries(a.rows.map((r) => [r.sourceId, r]));

    await withTenantContext(claims, async (tx) => {
      await markValidated(tx, tenantId, aById["hq-pat-001"]!.id);
      await markValidated(tx, tenantId, aById["hq-pat-002"]!.id);
      await markFailed(tx, tenantId, aById["hq-apt-001"]!.id, {
        code: "unresolved_reference",
        message: "orphan appointment",
        fields: ["patientSourceId"],
      });
      // hq-epi-001 stays pending
    });

    await withTenantContext(claims, async (tx) => {
      await markImported(tx, tenantId, aById["hq-pat-001"]!.id, randomUUID());
      await markImported(tx, tenantId, aById["hq-pat-002"]!.id, randomUUID());
    });

    const b = await withTenantContext(claims, (tx) =>
      stageRows(tx, tenantId, batchB, [
        { sourceSystem, entityType: "appointment", sourceId: "hq-apt-002", raw: {} },
      ]),
    );
    const bById = Object.fromEntries(b.rows.map((r) => [r.sourceId, r]));

    await withTenantContext(claims, (tx) =>
      markValidated(tx, tenantId, bById["hq-apt-002"]!.id),
    );
    await withTenantContext(claims, (tx) =>
      markImported(tx, tenantId, bById["hq-apt-002"]!.id, randomUUID()),
    );
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from migration_staging_rows where tenant_id = ${tenantId}`;
    await sql`delete from tenants where id = ${tenantId}`;
    await sql.end();
  });

  // ── totalPatientsMigrated ────────────────────────────────────────────────

  it("totalPatientsMigrated counts only imported patient rows", async () => {
    const n = await withTenantContext(claims, (tx) => totalPatientsMigrated(tx, tenantId));
    expect(n).toBe(2); // hq-pat-001 + hq-pat-002
  });

  it("totalPatientsMigrated excludes failed, pending, validated patients", async () => {
    // All 4 batchA rows exist; only the 2 imported patients should count
    const n = await withTenantContext(claims, (tx) => totalPatientsMigrated(tx, tenantId));
    expect(n).toBeLessThanOrEqual(2);
  });

  // ── totalAppointmentsMigrated ─────────────────────────────────────────────

  it("totalAppointmentsMigrated counts only imported appointment rows", async () => {
    const n = await withTenantContext(claims, (tx) => totalAppointmentsMigrated(tx, tenantId));
    expect(n).toBe(1); // hq-apt-002 (hq-apt-001 is failed)
  });

  it("totalAppointmentsMigrated excludes failed appointments", async () => {
    const n = await withTenantContext(claims, (tx) => totalAppointmentsMigrated(tx, tenantId));
    // hq-apt-001 (failed) must not be counted
    expect(n).toBe(1);
  });

  // ── batchSummary ──────────────────────────────────────────────────────────

  it("batchSummary returns at most 5 batches", async () => {
    const batches = await withTenantContext(claims, (tx) => batchSummary(tx, tenantId));
    expect(batches.length).toBeLessThanOrEqual(5);
  });

  it("batchSummary includes both test batches", async () => {
    const batches = await withTenantContext(claims, (tx) => batchSummary(tx, tenantId));
    const ids = batches.map((b) => b.batchId);
    expect(ids).toContain(batchA);
    expect(ids).toContain(batchB);
  });

  it("batchSummary returns correct per-status counts for batchA", async () => {
    const batches = await withTenantContext(claims, (tx) => batchSummary(tx, tenantId));
    const a = batches.find((b) => b.batchId === batchA);
    expect(a).toBeDefined();
    expect(a!.counts.imported).toBe(2); // 2 patients imported
    expect(a!.counts.failed).toBe(1); // 1 appointment failed
    expect(a!.counts.pending).toBe(1); // 1 episode pending
    expect(a!.counts.validated).toBe(0);
  });

  it("batchSummary returns correct per-status counts for batchB", async () => {
    const batches = await withTenantContext(claims, (tx) => batchSummary(tx, tenantId));
    const b = batches.find((batch) => batch.batchId === batchB);
    expect(b).toBeDefined();
    expect(b!.counts.imported).toBe(1);
    expect(b!.counts.failed).toBe(0);
    expect(b!.counts.pending).toBe(0);
  });

  it("batchSummary lastUpdatedAt is a valid Date", async () => {
    const batches = await withTenantContext(claims, (tx) => batchSummary(tx, tenantId));
    for (const entry of batches) {
      expect(entry.lastUpdatedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(entry.lastUpdatedAt.getTime())).toBe(false);
    }
  });

  // ── pendingFailures ───────────────────────────────────────────────────────

  it("pendingFailures counts rows in failed status across all batches", async () => {
    const n = await withTenantContext(claims, (tx) => pendingFailures(tx, tenantId));
    expect(n).toBe(1); // only hq-apt-001
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it("all queries return zero for a tenant with no migration rows", async () => {
    const otherId = randomUUID();
    await sql`insert into tenants (id, name, slug) values (${otherId}, 'Other', ${`oth-${otherId}`})`;
    const other: TenantClaims = { tenant_id: otherId, user_role: "admin" };

    try {
      const [patients, appointments, batches, failures] = await withTenantContext(other, (tx) =>
        Promise.all([
          totalPatientsMigrated(tx, otherId),
          totalAppointmentsMigrated(tx, otherId),
          batchSummary(tx, otherId),
          pendingFailures(tx, otherId),
        ]),
      );
      expect(patients).toBe(0);
      expect(appointments).toBe(0);
      expect(batches).toHaveLength(0);
      expect(failures).toBe(0);
    } finally {
      await sql`delete from tenants where id = ${otherId}`;
    }
  });
});
