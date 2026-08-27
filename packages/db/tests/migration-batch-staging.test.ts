/**
 * migration-batch-staging.test.ts — MIG-09, the chunked staging and validation
 * writes.
 *
 * WHAT IS BEING PROVEN. Not speed — speed is measured by the rehearsal, on real
 * data. These assert the only thing that makes the speed acceptable: that
 * chunking changes NOTHING about the ledger. Same rows, same statuses, same
 * error details, same preservation of what was already imported.
 *
 * THE COMPARISON IS RUN, NOT ASSUMED. `stageRows` takes a chunk size, and `0`
 * means "one statement, as it was before MIG-09" — so the same 501 rows go
 * through both shapes, into two tenants, and the ledgers are compared row for
 * row.
 *
 * GATING: requires a live, privileged DATABASE_URL with migrations applied.
 * Skipped when absent so `vitest run` stays green without a DB; CI's
 * db-tests.yml sets it, so these EXECUTE there.
 *
 * NO FIXTURE IS A REAL ROW. Every value below is generated in this file.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  markFailed,
  markValidated,
  STAGE_CHUNK_SIZE,
  stageRows,
  TRANSITION_CHUNK_SIZE,
  transitionMany,
  withTenantContext,
  type TenantClaims,
} from "../index";
import { migrationStagingRows } from "../src/schema";
import { connect, live } from "./rls-harness";

const SOURCE_SYSTEM = "fisiozero";

describe.skipIf(!live)("MIG-09 — chunked staging + validation writes (live DB)", () => {
  let sql: Sql;
  const tenants: string[] = [];

  async function freshTenant(label: string) {
    const tenantId = randomUUID();
    tenants.push(tenantId);
    await sql`
      insert into tenants (id, name, slug)
      values (${tenantId}, ${`Staging ${label}`}, ${`mig09-${tenantId}`})`;
    const claims: TenantClaims = { tenant_id: tenantId, user_role: "owner" };
    return { tenantId, claims };
  }

  const input = (n: number) => ({
    sourceSystem: SOURCE_SYSTEM,
    entityType: "patient" as const,
    sourceId: `s-${n}`,
    raw: { n, note: "sintético" },
  });

  /** The ledger, ordered and stripped of the ids that cannot match across tenants. */
  async function ledgerOf(tenantId: string, claims: TenantClaims) {
    const rows = await withTenantContext(claims, (tx) =>
      tx
        .select({
          sourceId: migrationStagingRows.sourceId,
          entityType: migrationStagingRows.entityType,
          sourceSystem: migrationStagingRows.sourceSystem,
          status: migrationStagingRows.status,
          raw: migrationStagingRows.raw,
          errorDetail: migrationStagingRows.errorDetail,
          importedEntityId: migrationStagingRows.importedEntityId,
        })
        .from(migrationStagingRows)
        .where(eq(migrationStagingRows.tenantId, tenantId)),
    );
    return rows
      .map((r) => ({ ...r, hasEntityId: r.importedEntityId !== null, importedEntityId: undefined }))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }

  beforeAll(() => {
    sql = connect();
  });

  afterAll(async () => {
    if (!sql || tenants.length === 0) return;
    await sql`delete from migration_staging_rows where tenant_id in ${sql(tenants)}`;
    await sql`delete from tenants where id in ${sql(tenants)}`;
    await sql.end();
  });

  /* ================================================================== *
   * A5.1 — CHUNKED STAGING IS THE SAME LEDGER AS ONE STATEMENT          *
   * ================================================================== */

  it("a 501-row batch stages to the identical ledger chunked or in one statement", async () => {
    // 501 CROSSES THE BOUNDARY DELIBERATELY: 500 + 1, so the second chunk holds
    // a single row and the seam is exercised rather than divided away.
    const N = STAGE_CHUNK_SIZE + 1;
    const rows = Array.from({ length: N }, (_, i) => input(i));

    const chunked = await freshTenant("chunked");
    const batchA = randomUUID();
    const rChunk = await withTenantContext(chunked.claims, (tx) =>
      stageRows(tx, chunked.tenantId, batchA, rows),
    );

    const single = await freshTenant("one-statement");
    const batchB = randomUUID();
    // chunkSize 0 = one statement for the whole set, which is what stageRows
    // did before MIG-09. This is the "before" half of the comparison.
    const rSingle = await withTenantContext(single.claims, (tx) =>
      stageRows(tx, single.tenantId, batchB, rows, 0),
    );

    expect(rChunk.staged).toBe(N);
    expect(rSingle.staged).toBe(N);
    // Every returned row is distinct and covers the whole input, in both shapes.
    expect(new Set(rChunk.rows.map((r) => r.sourceId)).size).toBe(N);
    expect(
      rChunk.rows.map((r) => r.sourceId).sort((a, b) => a.localeCompare(b)),
    ).toEqual(rSingle.rows.map((r) => r.sourceId).sort((a, b) => a.localeCompare(b)));

    expect(await ledgerOf(chunked.tenantId, chunked.claims)).toEqual(
      await ledgerOf(single.tenantId, single.claims),
    );
  });

  /* ================================================================== *
   * A5.2 — RE-STAGING: A FAILED ROW RESETS, AN IMPORTED ROW DOES NOT    *
   * ================================================================== */

  it("re-staging resets a failed row to pending and leaves an imported row alone", async () => {
    // THE TWO HALVES MUST NOT BE THE SAME ANSWER, and chunking is exactly the
    // kind of change that could quietly make them so: the ON CONFLICT clause
    // now runs once per chunk instead of once, and a clause that lost its CASE
    // would look identical on the failed row and wrong on the imported one.
    const t = await freshTenant("re-stage");
    const batch1 = randomUUID();
    const rows = [input(1), input(2)];
    const staged = await withTenantContext(t.claims, (tx) =>
      stageRows(tx, t.tenantId, batch1, rows),
    );
    const byId = new Map(staged.rows.map((r) => [r.sourceId, r.id]));

    // s-1 → failed, with a detail. s-2 → imported, with an entity id.
    await withTenantContext(t.claims, (tx) =>
      markFailed(tx, t.tenantId, byId.get("s-1")!, {
        code: "validation_failed",
        message: "fullName is required",
        fields: ["fullName"],
      }),
    );
    const entityId = randomUUID();
    await sql`
      update migration_staging_rows
         set status = 'imported', imported_entity_id = ${entityId}
       where id = ${byId.get("s-2")!}`;

    // RE-STAGE, with a changed raw, in a second batch.
    const batch2 = randomUUID();
    await withTenantContext(t.claims, (tx) =>
      stageRows(
        tx,
        t.tenantId,
        batch2,
        rows.map((r) => ({ ...r, raw: { ...r.raw, note: "corrigido (sintético)" } })),
      ),
    );

    const after = await sql<
      {
        source_id: string;
        status: string;
        raw: { note: string };
        error_detail: unknown;
        imported_entity_id: string | null;
        batch_id: string;
      }[]
    >`
      select source_id, status, raw, error_detail, imported_entity_id, batch_id
        from migration_staging_rows where tenant_id = ${t.tenantId} order by source_id`;

    const failed = after.find((r) => r.source_id === "s-1")!;
    expect(failed.status).toBe("pending"); // reset
    expect(failed.error_detail).toBeNull(); // cleared
    expect(failed.raw.note).toBe("corrigido (sintético)"); // raw replaced
    expect(failed.batch_id).toBe(batch2);

    const imported = after.find((r) => r.source_id === "s-2")!;
    expect(imported.status).toBe("imported"); // UNTOUCHED
    expect(imported.imported_entity_id).toBe(entityId); // the ledger never forgets
    expect(imported.raw.note).toBe("corrigido (sintético)"); // raw refreshed for audit
    expect(imported.batch_id).toBe(batch2);
  });

  /* ================================================================== *
   * A5.3 — ONE VALIDATION FAILURE IN A CHUNK OF 500                     *
   * ================================================================== */

  it("a validation failure in a chunk of 500 is marked failed with its detail and the other 499 validated", async () => {
    // THE VALIDATE PHASE WRITES BOTH VERDICTS IN ONE STATEMENT, so this is the
    // assertion that a mixed chunk stays mixed: `transitionMany` carries a
    // per-row status and a per-row detail, and getting that wrong would mark
    // all 500 the same way while every count still reconciled.
    const N = TRANSITION_CHUNK_SIZE;
    const t = await freshTenant("mixed-chunk");
    const batchId = randomUUID();
    const rows = Array.from({ length: N }, (_, i) => input(i));
    const staged = await withTenantContext(t.claims, (tx) =>
      stageRows(tx, t.tenantId, batchId, rows),
    );
    const idBySource = new Map(staged.rows.map((r) => [r.sourceId, r.id]));

    const BAD = "s-317";
    const detail = {
      code: "validation_failed" as const,
      message: "fullName is required",
      fields: ["fullName"],
    };
    await withTenantContext(t.claims, (tx) =>
      transitionMany(
        tx,
        t.tenantId,
        ["pending"],
        rows.map((r) => ({
          stagingRowId: idBySource.get(r.sourceId)!,
          status: r.sourceId === BAD ? ("failed" as const) : ("validated" as const),
          errorDetail: r.sourceId === BAD ? detail : null,
        })),
      ),
    );

    const counts = await sql<{ status: string; n: number }[]>`
      select status, count(*)::int as n from migration_staging_rows
       where tenant_id = ${t.tenantId} group by status order by status`;
    expect(counts).toEqual([
      { status: "failed", n: 1 },
      { status: "validated", n: N - 1 },
    ]);

    const [bad] = await sql<{ status: string; error_detail: typeof detail }[]>`
      select status, error_detail from migration_staging_rows
       where tenant_id = ${t.tenantId} and source_id = ${BAD}`;
    expect(bad!.status).toBe("failed");
    expect(bad!.error_detail).toEqual(detail);

    // ...and every OTHER row carries no detail at all.
    const stray = await sql<{ n: number }[]>`
      select count(*)::int as n from migration_staging_rows
       where tenant_id = ${t.tenantId} and status = 'validated'
         and error_detail is not null`;
    expect(stray[0]!.n).toBe(0);
  });

  /* ================================================================== *
   * A5.4 — THE GUARD REFUSES THE WHOLE CHUNK, WHICH IS WHAT THE         *
   *        FALLBACK IS FOR                                              *
   * ================================================================== */

  it("a bulk transition whose expected status does not hold refuses the whole chunk", async () => {
    // This is the throw `import-core`'s validate phase catches to drop into the
    // per-row path. Without it a row in the wrong state would be silently
    // skipped by the UPDATE's WHERE and the count would still look right.
    const t = await freshTenant("guard");
    const batchId = randomUUID();
    const rows = [input(1), input(2), input(3)];
    const staged = await withTenantContext(t.claims, (tx) =>
      stageRows(tx, t.tenantId, batchId, rows),
    );
    // Move one row out of `pending` behind the transition's back.
    await withTenantContext(t.claims, (tx) =>
      markValidated(tx, t.tenantId, staged.rows[1]!.id),
    );

    await expect(
      withTenantContext(t.claims, (tx) =>
        transitionMany(
          tx,
          t.tenantId,
          ["pending"],
          staged.rows.map((r) => ({ stagingRowId: r.id, status: "validated" as const })),
        ),
      ),
    ).rejects.toThrow(/updated 2 of 3 staging row\(s\)/);
  });
});
