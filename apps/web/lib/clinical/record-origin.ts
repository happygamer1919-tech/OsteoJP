import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import type { DbTx } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";

/**
 * FICHA-IMPORTED-VIEW: IS THIS RECORD'S CONTENT THE IMPORTER'S?
 *
 * ==========================================================================
 * THE RULE, STATED ONCE. Every caller asks this module; nobody restates it.
 * ==========================================================================
 * A clinical record is IMPORTER-SOURCED when the importer's idempotency ledger
 * names it, or names a record its supersedes chain reaches:
 *
 *   there is a `migration_staging_rows` row with
 *     entity_type = 'clinical_record' AND
 *     imported_entity_id = the record itself, or any predecessor reached by
 *     walking `supersedes_id`, at most SUPERSEDES_WALK_LIMIT records deep.
 *
 * WHY THE LEDGER AND NOTHING ELSE. The importer (`clinicalRecordValues`,
 * packages/db/src/migration/upsert.ts) writes `source = 'manual'` and never a
 * `form_template_id`, and `record_source` has no imported value. So neither the
 * source column nor a missing template says "imported": a missing template is
 * ALSO what an AI ingestion draft and a patient submission look like, and
 * reading it as "imported" is the defect this card fixes. The one fact only the
 * importer writes is its ledger row (`markImported`, staging.ts).
 *
 * WHY THE CHAIN. A new version (records.ts `createAddendum`) copies the
 * template (NULL) and the data of the record it supersedes, takes the default
 * source and gets no ledger row of its own. Its content IS the imported
 * content, so it answers the same as the record it came from. Only a chain root
 * can carry a ledger row (the importer never sets `supersedes_id`), so checking
 * every record on the walk is the same answer as checking the root, without
 * having to know which one is the root.
 *
 * WHY BOUNDED. The walk is a recursive read; a bound means a malformed chain
 * costs a fixed number of rows rather than an unbounded scan. A chain longer
 * than the bound answers FALSE, which is the safe side: the page then shows the
 * content under a neutral heading instead of calling it imported.
 *
 * READ-ONLY, AND UNDER THE VIEWER'S OWN RLS. It runs in the caller's tenant
 * context (`runScoped`), so the ledger is the viewer's tenant's ledger and the
 * walk only crosses records the viewer can read. A therapist who can read a new
 * version but not the record it supersedes gets FALSE, again the neutral side.
 * Nothing here writes, and no migration backs it.
 */

/** The ledger's entity_type for a clinical record (migration_entity_type). */
export const IMPORT_LEDGER_ENTITY_TYPE = "clinical_record" as const;

/**
 * How many records the supersedes walk visits, the record itself included.
 * A real chain is a handful of versions; this only has to stop a bad one.
 */
export const SUPERSEDES_WALK_LIMIT = 50;

/**
 * The one statement that answers the rule. Exported so the unit test can read
 * its rendered SQL; production code calls `isImporterSourcedRecord`.
 */
export function importerSourcedRecordSql(recordId: string): SQL {
  return sql`
    with recursive chain (id, supersedes_id, depth) as (
      select cr.id, cr.supersedes_id, 1
        from public.clinical_records cr
       where cr.id = ${recordId}::uuid
      union all
      select prev.id, prev.supersedes_id, chain.depth + 1
        from public.clinical_records prev
        join chain on prev.id = chain.supersedes_id
       where chain.depth < ${SUPERSEDES_WALK_LIMIT}::int
    )
    select exists (
      select 1
        from public.migration_staging_rows ledger
       where ledger.entity_type = ${IMPORT_LEDGER_ENTITY_TYPE}::public.migration_entity_type
         and ledger.imported_entity_id in (select chain.id from chain)
    ) as importer_sourced
  `;
}

/** Normalise the driver's result: postgres-js returns an array of rows. */
function firstRow(result: unknown): Record<string, unknown> | undefined {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] } | null)?.rows ?? []);
  return rows[0] as Record<string, unknown> | undefined;
}

/** The rule, inside a transaction the caller already holds. */
export async function readImporterSourced(tx: DbTx, recordId: string): Promise<boolean> {
  const row = firstRow(await tx.execute(importerSourcedRecordSql(recordId)));
  return row?.importer_sourced === true;
}

/**
 * The rule for the record being viewed, in the viewer's request context. Same
 * read gate as `getRecordDetail`: whoever may open the record may learn where
 * its content came from, and nobody else.
 */
export async function isImporterSourcedRecord(
  ctx: RequestContext,
  recordId: string,
): Promise<boolean> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, (tx) => readImporterSourced(tx, recordId), "clinical:record-origin");
}
