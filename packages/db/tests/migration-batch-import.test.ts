/**
 * migration-batch-import.test.ts — MIG-08, the chunked import path.
 *
 * WHAT IS BEING PROVEN, and it is not "batching is faster". Speed is measured
 * by the rehearsal, on real data, and a unit test that timed anything would be
 * measuring this laptop. What these assert is the ONLY thing that makes the
 * speed acceptable: that the chunked path writes EXACTLY what the per-row path
 * writes, and that a single bad row inside a chunk costs one row rather than
 * two hundred.
 *
 * THE COMPARISON IS RUN, NOT ASSUMED. `importRecords` takes `chunkSize`, and
 * `chunkSize: 0` puts every row on the per-row path — so the same 201 records
 * go through both paths, into two tenants, and the ledger and target rows are
 * compared field by field. Without that seam this file could only assert that
 * the chunked path is self-consistent, which is the assertion a defect passes.
 *
 * GATING: requires a live, privileged DATABASE_URL with migrations applied.
 * Skipped when absent so `vitest run` stays green without a DB; CI's
 * db-tests.yml sets it, so these EXECUTE there.
 *
 * NO FIXTURE IS A REAL ROW. Every value below is generated in this file.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  IMPORT_CHUNK_SIZE,
  importRecords,
  markValidated,
  resolveImportedIds,
  stageRows,
  withTenantContext,
  type MigrationResolvers,
  type TenantClaims,
} from "../index";
import { appointments, migrationStagingRows, patients } from "../src/schema";
import type { MigrationRecord } from "../src/migration/types";
import { connect, live } from "./rls-harness";

const SOURCE_SYSTEM = "fisiozero";

describe.skipIf(!live)("MIG-08 — chunked import writes (live DB)", () => {
  let sql: Sql;
  const tenants: string[] = [];

  /** A tenant with one location and one practitioner, ready to import into. */
  async function freshTenant(label: string) {
    const tenantId = randomUUID();
    const locationId = randomUUID();
    const practitionerId = randomUUID();
    tenants.push(tenantId);
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantId}, ${`Batch ${label}`}, ${`mig08-${tenantId}`})`;
    await sql`
      insert into locations (id, tenant_id, name)
      values (${locationId}, ${tenantId}, 'Linda-a-Velha')`;
    await sql`
      insert into users (id, tenant_id, email, full_name)
      values (${practitionerId}, ${tenantId}, ${`jp-${tenantId}@example.pt`}, 'JP (sintético)')`;
    const claims: TenantClaims = { tenant_id: tenantId, user_role: "owner" };
    const resolvers: MigrationResolvers = {
      locationIdByKey: { "linda-a-velha": locationId },
      practitionerIdByKey: { jp: practitionerId },
    };
    return { tenantId, locationId, practitionerId, claims, resolvers };
  }

  /** A patient record. `patientNumber` omitted entirely when not supplied — an
   *  absent key is what lets 0029's trigger assign one; null would be rejected. */
  const patientRec = (n: number, patientNumber?: number): MigrationRecord =>
    ({
      entityType: "patient",
      data: {
        sourceId: `p-${n}`,
        fullName: `Paciente Sintético ${n}`,
        locationKeys: ["linda-a-velha"],
        primaryLocationKey: "linda-a-velha",
        ...(patientNumber === undefined ? {} : { patientNumber }),
      },
    }) as MigrationRecord;

  const apptRec = (n: number, patientSourceId: string): MigrationRecord =>
    ({
      entityType: "appointment",
      data: {
        sourceId: `a-${n}`,
        patientSourceId,
        practitionerKey: "jp",
        locationKey: "linda-a-velha",
        startsAt: new Date(Date.UTC(2020, 0, 1, 9, 0, 0) + n * 3_600_000).toISOString(),
        endsAt: new Date(Date.UTC(2020, 0, 1, 10, 0, 0) + n * 3_600_000).toISOString(),
        status: "completed",
        notes: null,
      },
    }) as MigrationRecord;

  /** Stage + validate every record, so the import loop sees `validated` rows. */
  async function stageAndValidate(
    tenantId: string,
    claims: TenantClaims,
    recs: MigrationRecord[],
  ) {
    const batchId = randomUUID();
    await withTenantContext(claims, (tx) =>
      stageRows(
        tx,
        tenantId,
        batchId,
        recs.map((r) => ({
          sourceSystem: SOURCE_SYSTEM,
          entityType: r.entityType,
          sourceId: r.data.sourceId,
          raw: {},
        })),
      ),
    );
    const rows = await withTenantContext(claims, (tx) =>
      tx
        .select({ id: migrationStagingRows.id, sourceId: migrationStagingRows.sourceId })
        .from(migrationStagingRows)
        .where(eq(migrationStagingRows.tenantId, tenantId)),
    );
    await withTenantContext(claims, async (tx) => {
      for (const r of rows) await markValidated(tx, tenantId, r.id);
    });
    return batchId;
  }

  /** The ledger, as the comparison sees it: source id → status + whether an id landed. */
  async function ledgerOf(tenantId: string, claims: TenantClaims) {
    const rows = await withTenantContext(claims, (tx) =>
      tx
        .select({
          sourceId: migrationStagingRows.sourceId,
          entityType: migrationStagingRows.entityType,
          status: migrationStagingRows.status,
          importedEntityId: migrationStagingRows.importedEntityId,
          errorDetail: migrationStagingRows.errorDetail,
        })
        .from(migrationStagingRows)
        .where(eq(migrationStagingRows.tenantId, tenantId)),
    );
    return rows
      .map((r) => ({
        sourceId: r.sourceId,
        entityType: r.entityType,
        status: r.status,
        hasEntityId: r.importedEntityId !== null,
        errorCode: (r.errorDetail as { code?: string } | null)?.code ?? null,
      }))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }

  beforeAll(() => {
    sql = connect();
  });

  afterAll(async () => {
    if (!sql || tenants.length === 0) return;
    // Child-first; the tenant cascade covers the rest.
    await sql`delete from appointments where tenant_id in ${sql(tenants)}`;
    await sql`delete from patient_locations where tenant_id in ${sql(tenants)}`;
    await sql`delete from patients where tenant_id in ${sql(tenants)}`;
    await sql`delete from migration_staging_rows where tenant_id in ${sql(tenants)}`;
    await sql`delete from users where tenant_id in ${sql(tenants)}`;
    await sql`delete from locations where tenant_id in ${sql(tenants)}`;
    await sql`delete from tenants where id in ${sql(tenants)}`;
    await sql.end();
  });

  /* ================================================================== *
   * A6.1 — ONE BAD ROW COSTS ONE ROW, NOT THE CHUNK                     *
   * ================================================================== */

  it("a chunk carrying one bad row imports the other 199 and fails that one with its sqlstate", async () => {
    // THE FAILURE IS A REAL DATABASE FAILURE, not a resolver miss. A resolver
    // miss is caught while the chunk is assembled and never enters it; what has
    // to be proven here is the other case — a row Postgres itself refuses, mid
    // multi-row INSERT, which rolls the whole statement back. 200 rows, one of
    // them carrying a patient_number that already exists in the tenant, so
    // `patients_tenant_number_uq` refuses it.
    const t = await freshTenant("bad-row");
    await sql`
      insert into patients (tenant_id, full_name, patient_number, primary_location_id)
      values (${t.tenantId}, 'Existente (sintético)', 500, ${t.locationId})`;

    const recs = Array.from({ length: IMPORT_CHUNK_SIZE }, (_, i) =>
      // row 42 collides with the 500 seeded above; every other number is unique.
      patientRec(i, i === 42 ? 500 : 1000 + i),
    );
    await stageAndValidate(t.tenantId, t.claims, recs);

    const summary = await withTenantContext(t.claims, (tx) =>
      importRecords(tx, t.tenantId, SOURCE_SYSTEM, recs, t.resolvers),
    );

    expect(summary.inserted).toBe(IMPORT_CHUNK_SIZE - 1);
    expect(summary.failed).toBe(1);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]!.sourceId).toBe("p-42");

    // THE SQLSTATE SURVIVES THE FALLBACK. This is the whole point of importing
    // the chunk row by row rather than failing all 200: the detail names the
    // constraint, which is the one instruction the runbook gives on a failure.
    const detail = summary.failures[0]!.detail;
    expect(detail.code).toBe("import_failed");
    expect(detail.message).toContain("sqlstate 23505");
    expect(detail.message).toContain("patients_tenant_number_uq");

    // ...and the ledger says the same thing, row by row.
    const ledger = await ledgerOf(t.tenantId, t.claims);
    expect(ledger.filter((r) => r.status === "imported")).toHaveLength(IMPORT_CHUNK_SIZE - 1);
    const bad = ledger.find((r) => r.sourceId === "p-42")!;
    expect(bad.status).toBe("failed");
    expect(bad.errorCode).toBe("import_failed");
    expect(bad.hasEntityId).toBe(false);

    // THE BATCH IS A FAILED BATCH. `run-import.mjs` derives its exit code from
    // the import summary's `failed`, so a non-zero here IS exit 1 — asserted as
    // the predicate rather than by shelling out to the runner.
    const exit = summary.failed === 0 ? 0 : 1;
    expect(exit).toBe(1);

    // 199 rows landed in the target table, not 0.
    const landed = await sql<{ n: number }[]>`
      select count(*)::int as n from patients where tenant_id = ${t.tenantId}`;
    expect(landed[0]!.n).toBe(IMPORT_CHUNK_SIZE); // 199 imported + the 1 seeded
  });

  /* ================================================================== *
   * A6.2 — CHUNK BOUNDARIES CHANGE NOTHING                              *
   * ================================================================== */

  it("a 201-row entity produces the identical ledger and rows chunked or per-row", async () => {
    // 201 CROSSES A BOUNDARY DELIBERATELY: 200 + 1, so the second chunk holds a
    // single row and the seam is exercised rather than assumed away by a count
    // that divides evenly.
    const N = IMPORT_CHUNK_SIZE + 1;
    const recs = Array.from({ length: N }, (_, i) => patientRec(i, 2000 + i));

    const chunked = await freshTenant("chunked");
    await stageAndValidate(chunked.tenantId, chunked.claims, recs);
    const sChunk = await withTenantContext(chunked.claims, (tx) =>
      importRecords(tx, chunked.tenantId, SOURCE_SYSTEM, recs, chunked.resolvers),
    );

    const perRow = await freshTenant("per-row");
    await stageAndValidate(perRow.tenantId, perRow.claims, recs);
    const sRow = await withTenantContext(perRow.claims, (tx) =>
      importRecords(tx, perRow.tenantId, SOURCE_SYSTEM, recs, perRow.resolvers, {
        chunkSize: 0,
      }),
    );

    expect(sChunk.inserted).toBe(N);
    expect(sChunk).toEqual(sRow);
    expect(await ledgerOf(chunked.tenantId, chunked.claims)).toEqual(
      await ledgerOf(perRow.tenantId, perRow.claims),
    );

    // The TARGET rows agree too, column for column, not just the ledger.
    const cols = (tenantId: string) => sql`
      select full_name, patient_number, primary_location_id is not null as placed
        from patients where tenant_id = ${tenantId} order by patient_number`;
    expect(await cols(chunked.tenantId)).toEqual(await cols(perRow.tenantId));

    // And every patient got its location link, which is a SEPARATE statement in
    // the chunked path (one multi-row insert for the whole chunk).
    const links = (tenantId: string) => sql<{ n: number }[]>`
      select count(*)::int as n from patient_locations where tenant_id = ${tenantId}`;
    expect((await links(chunked.tenantId))[0]!.n).toBe(N);
    expect((await links(perRow.tenantId))[0]!.n).toBe(N);
  });

  /* ================================================================== *
   * A6.3 — UNNUMBERED PATIENTS ARE NEVER IN A CHUNK (A4 / B5)           *
   * ================================================================== */

  it("unnumbered patients import one statement at a time, after every numbered one", async () => {
    // WHY THIS CANNOT BE BATCHED. 0029's assign_patient_number fills a NULL
    // patient_number with COALESCE(MAX(patient_number),0)+1. In a multi-row
    // INSERT every row of the chunk reads the SAME max, so all of them would
    // compute the same number and `patients_tenant_number_uq` would refuse all
    // but one. The observable consequence of getting this wrong is therefore
    // LOUD — which is exactly why the assertion is on the numbers themselves.
    const t = await freshTenant("unnumbered");
    const numbered = Array.from({ length: 5 }, (_, i) => patientRec(i, 10 + i));
    const unnumbered = Array.from({ length: 12 }, (_, i) => patientRec(100 + i));
    // Interleaved on input, deliberately: the split is by PREDICATE, so the
    // ordering guarantee cannot depend on the caller having sorted first.
    const recs = numbered.flatMap((r, i) => [r, ...(unnumbered[i] ? [unnumbered[i]!] : [])]);
    recs.push(...unnumbered.slice(5));
    await stageAndValidate(t.tenantId, t.claims, recs);

    const summary = await withTenantContext(t.claims, (tx) =>
      importRecords(tx, t.tenantId, SOURCE_SYSTEM, recs, t.resolvers),
    );

    expect(summary.failed).toBe(0);
    expect(summary.inserted).toBe(recs.length);

    const rows = await sql<{ patient_number: number }[]>`
      select patient_number from patients
       where tenant_id = ${t.tenantId} order by patient_number`;
    const nums = rows.map((r) => r.patient_number);

    // EVERY NUMBER IS DISTINCT. A batched unnumbered chunk fails this.
    expect(new Set(nums).size).toBe(recs.length);
    // The five vendor numbers carried over verbatim.
    expect(nums).toEqual(expect.arrayContaining([10, 11, 12, 13, 14]));
    // B5: the trigger only ever saw a MAX that already included every vendor
    // number, so nothing it assigned can collide with one.
    const assigned = nums.filter((n) => n < 10 || n > 14);
    expect(assigned).toHaveLength(12);
    expect(Math.min(...assigned)).toBeGreaterThan(14);
  });

  /* ================================================================== *
   * A6.4 — THE PRELOADED MAP AGREES WITH THE LEDGER, ROW FOR ROW        *
   * ================================================================== */

  it("the preloaded parent map yields the same ids the per-row ledger lookup did", async () => {
    // The per-row `resolveImportedIds` SELECT is gone; `preloadRefs` runs it
    // ONCE per group instead. This asserts the substitution is exact: every
    // appointment's patient_id equals what the ledger says that source id
    // resolves to, asked the old way, one id at a time.
    const t = await freshTenant("refs");
    const pats = Array.from({ length: 5 }, (_, i) => patientRec(i, 3000 + i));
    const appts = pats.map((p, i) => apptRec(i, p.data.sourceId));
    await stageAndValidate(t.tenantId, t.claims, [...pats, ...appts]);

    const summary = await withTenantContext(t.claims, (tx) =>
      importRecords(tx, t.tenantId, SOURCE_SYSTEM, [...pats, ...appts], t.resolvers),
    );
    expect(summary.failed).toBe(0);
    expect(summary.inserted).toBe(pats.length + appts.length);

    for (const a of appts) {
      const sourceId = (a.data as { patientSourceId: string }).patientSourceId;
      // The OLD primitive, one id at a time, straight off the ledger.
      const oneAtATime = await withTenantContext(t.claims, (tx) =>
        resolveImportedIds(tx, t.tenantId, SOURCE_SYSTEM, "patient", [sourceId]),
      );
      const [row] = await withTenantContext(t.claims, (tx) =>
        tx
          .select({ patientId: appointments.patientId })
          .from(appointments)
          .innerJoin(
            migrationStagingRows,
            eq(migrationStagingRows.importedEntityId, appointments.id),
          )
          .where(
            and(
              eq(appointments.tenantId, t.tenantId),
              eq(migrationStagingRows.sourceId, a.data.sourceId),
              eq(migrationStagingRows.entityType, "appointment"),
            ),
          ),
      );
      expect(row!.patientId).toBe(oneAtATime.get(sourceId));
    }

    // And the patients those ids name are this tenant's, not somebody else's.
    const referenced = await withTenantContext(t.claims, (tx) =>
      tx
        .select({ patientId: appointments.patientId })
        .from(appointments)
        .where(eq(appointments.tenantId, t.tenantId)),
    );
    const owned = await withTenantContext(t.claims, (tx) =>
      tx
        .select({ id: patients.id })
        .from(patients)
        .where(
          and(
            eq(patients.tenantId, t.tenantId),
            inArray(
              patients.id,
              referenced.map((r) => r.patientId),
            ),
          ),
        ),
    );
    expect(owned).toHaveLength(pats.length);
  });
});
