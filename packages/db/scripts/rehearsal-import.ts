/**
 * THE LIVE ENTRYPOINT. Binds the Fisiozero adapter and the real `packages/db`
 * pipeline to the orchestration in `scripts/import/run-import.mjs`.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS: MIG-03 SHIPPED WITHOUT IT, AND SAID SO
 * ==========================================================================
 * `scripts/import/run-import.mjs` is a plain `.mjs` module because `packages/db`
 * ships RAW TYPESCRIPT with no build step (`package.json` main is `./index.ts`),
 * so bare node cannot import the pipeline. Its `runImport()` therefore takes an
 * INJECTED pipeline, and its own `main()` refuses every invocation with
 * BAD_INVOCATION and prints the instruction this file follows:
 *
 *   "Import runImport() from a tsx entrypoint and pass
 *    { adapterResult, config, pipeline }."
 *
 * That entrypoint did not exist. MIG-03's `open_on_purpose` names the
 * consequence exactly - "it has no live wiring to packages/db yet ... binding
 * the real one needs a tsx entrypoint" - so the runner has never met a
 * database, and no rehearsal transcript was obtainable without this file.
 *
 * NO ORCHESTRATION LIVES HERE. Order, the mapping refusal, the confirmation
 * phrase, the attachment precondition and the exit codes all stay in
 * `run-import.mjs`, where 23 assertions and three negative controls hold them.
 * This file does four things and nothing else: GUARD the target, READ the
 * delivery, BUILD the resolvers, and OPEN the transaction.
 *
 * ==========================================================================
 * IVAN RUNS THIS. NO TERMINAL EVER DOES.
 * ==========================================================================
 * CLAUDE.md, "Patient data isolation (Fisiozero import)": it reads delivery
 * CSVs off disk, so a terminal may not invoke it. Standing rules 1 and 2 also
 * forbid a terminal pointing anything at a Supabase project it did not create.
 *
 * Usage:
 *   pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
 *     --delivery <dir> --config <mapping-config.local.json> [MODE]
 *
 *   MODE is one of:
 *     --emit-attachment-mapping <out.json>   adapter only, NO database opened
 *     --dry-run                              adapter only, NO database opened
 *     (default)                              PREVIEW: stage + validate, no target write
 *     --apply --confirm "<phrase>"           live import
 *
 * Env (NAMES only, values never printed): DATABASE_URL
 * Exit: 0 OK · 1 FAILED or refused · 2 BAD_INVOCATION   (CLAUDE.md, ratified)
 */

import { and, eq } from "drizzle-orm";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { withTenantContext, type DbTx } from "../src/client";
import { migrationStagingRows } from "../src/schema";
import {
  adaptFisiozeroDelivery,
  type FisiozeroAdapterResult,
  type FisiozeroLocationResolution,
} from "../src/migration/sources/fisiozero";
import { generateReconciliationReport } from "../src/migration/reconciliation";
import { markFailed, markValidated, stageRows } from "../src/migration/staging";
import { importRecords } from "../src/migration/upsert";
import { validateMigrationRecord } from "../src/migration/validate";
import type {
  MigrationEntityType,
  MigrationResolvers,
} from "../src/migration/types";
import type { SourceRecord } from "../src/migration/source";
import { PROD_REFS, parseProjectRef } from "../seed/seed-guard";

const SOURCE_SYSTEM = "fisiozero";

/**
 * The rehearsal batch id. A CONSTANT, and both halves of that matter.
 *
 * IT IS A UUID BECAUSE THE COLUMN IS. `migration_staging_rows.batch_id` is
 * `uuid NOT NULL` (schema.ts:1493), not free text. A readable label like
 * "rehearsal-fisiozero" is rejected by Postgres at insert - caught here while
 * wiring rather than in the middle of Ivan's first staging run.
 *
 * IT IS FIXED BECAUSE THE IDEMPOTENCY PROOF DEPENDS ON IT. Reconciliation is
 * scoped by batch id, and a fresh id per run would give the second `--apply` an
 * EMPTY batch to reconcile - which reports zero of everything and looks exactly
 * like the clean no-op the step is trying to prove. `--batch <uuid>` overrides
 * it for a deliberately separate run.
 */
const REHEARSAL_BATCH_ID = "1e4ea5a1-0000-4000-8000-000000000001";

/** Postgres rejects a non-uuid `batch_id`; this refuses before the connection. */
export const isUuid = (v: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ====================================================================== */
/* THE CONFIG                                                              */
/* ====================================================================== */

/**
 * `scripts/import/mapping-config.template.json`, filled in.
 *
 * `tenantId` IS REQUIRED AND THE TEMPLATE DID NOT CARRY IT. Found while wiring
 * this file: `adaptFisiozeroDelivery` takes `tenantId` (it builds the storage
 * prefix `<tenantId>/migration/fisiozero/<file>`) and every pipeline call is
 * tenant-scoped, but the committed template has no such slot. A config filled
 * exactly as the template asks is therefore NOT sufficient to run. The slot is
 * added to the template in the same commit as this file.
 */
type MappingConfig = {
  tenantId?: string;
  location?: {
    kind?: string;
    locationKey?: string;
    column?: string;
    knownLocations?: Record<string, string>;
    locationKeyByValue?: Record<string, string>;
  };
  practitionerKeyByName?: Record<string, string>;
  serviceKeyByType?: Record<string, string>;
};

/** Drop the `_README` documentation arrays before anything reads a map. */
function stripReadme(obj: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Turn the config into the adapter's location resolution.
 *
 * THE TEMPLATE'S `knownLocations` IS A MENU, NOT THE ANSWER. `locationKey`
 * names which entry of it this delivery belongs to, and the adapter wants the
 * resolved VALUE. Passing the menu key through would emit `"linda-a-velha"` as
 * the location key and then fail in `upsert.ts` with `unresolved("locationKey")`
 * - after staging, which is exactly the class of late failure MIG-03's
 * placeholder check exists to prevent.
 */
export function locationResolution(config: MappingConfig): FisiozeroLocationResolution {
  const loc = config.location ?? {};
  const known = stripReadme(loc.knownLocations);
  if (loc.kind === "column") {
    const byValue = stripReadme(loc.locationKeyByValue);
    return { kind: "column", column: String(loc.column ?? ""), locationKeyByValue: byValue };
  }
  const chosen = loc.locationKey ?? "";
  const resolved = known[chosen];
  if (!resolved) {
    throw new Error(
      `location.locationKey ${JSON.stringify(chosen)} has no entry in location.knownLocations`,
    );
  }
  return { kind: "fixed", locationKey: resolved };
}

/**
 * Build `MigrationResolvers` from the config.
 *
 * ==========================================================================
 * THE RESOLVERS ARE IDENTITY MAPS, AND THAT IS NOT A SHORTCUT
 * ==========================================================================
 * The pipeline has two levels: the adapter emits a symbolic KEY, and
 * `MigrationResolvers` turns that key into a target uuid. The committed mapping
 * config collapses both into one step - it maps `terapeuta` free text STRAIGHT
 * ONTO a uuid, so the key the adapter emits IS the uuid.
 *
 * That is the template's own design (`"Jp": "<uuid>"`), and it is a reasonable
 * one: a second layer of invented slugs would be one more thing to fill in
 * wrong. But `upsert.ts` still LOOKS EVERY KEY UP, and throws
 * `unresolved("practitionerKey")` for a key with no entry - so the map cannot
 * simply be omitted. The identity map is what makes the two levels agree.
 *
 * WRITTEN DOWN RATHER THAN LEFT TO BE REDISCOVERED, because a reader who
 * assumes the usual two-level shape will conclude this file has a bug.
 */
export function buildResolvers(config: MappingConfig): MigrationResolvers {
  const identity = (values: string[]): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const v of values) m[v] = v;
    return m;
  };
  const loc = config.location ?? {};
  const locationValues =
    loc.kind === "column"
      ? Object.values(stripReadme(loc.locationKeyByValue))
      : Object.values(stripReadme(loc.knownLocations));

  return {
    locationIdByKey: identity(locationValues),
    practitionerIdByKey: identity(Object.values(stripReadme(config.practitionerKeyByName))),
    serviceIdByKey: identity(Object.values(stripReadme(config.serviceKeyByType))),
  };
}

/* ====================================================================== */
/* THE DELIVERY                                                            */
/* ====================================================================== */

/**
 * Read the four delivery shapes off disk.
 *
 * THE ADAPTER TAKES TEXT, NOT PATHS, deliberately (`packages/db` has no fs
 * access on that path at all), so the reading happens here. A BOM is stripped
 * because the adapter's `toObjects` strips only the one at position zero and
 * `readFileSync(..., "utf8")` leaves it in the string.
 */
export function readDelivery(dir: string): {
  pacientes: string;
  marcacoes?: string;
  episodios: Array<{ fileName: string; csv: string }>;
  documentos?: string;
  files: string[];
} {
  const names = fs.readdirSync(dir);
  const read = (n: string) => fs.readFileSync(path.join(dir, n), "utf8").replace(/^﻿/, "");
  const pacientes = names.includes("pacientes.csv") ? read("pacientes.csv") : null;
  if (pacientes === null) throw new Error("pacientes.csv is absent from the delivery directory");

  const episodios = names
    .filter((n) => /^Episodios[_-].+\.csv$/i.test(n))
    .sort()
    .map((fileName) => ({ fileName, csv: read(fileName) }));

  return {
    pacientes,
    marcacoes: names.includes("marcacoes.csv") ? read("marcacoes.csv") : undefined,
    episodios,
    documentos: names.includes("documentos.csv") ? read("documentos.csv") : undefined,
    files: names,
  };
}

/**
 * `{ deliveryFileName: storagePath }` - the `--mapping` file
 * `scripts/import/copy-attachments.mjs` requires.
 *
 * NOTHING PRODUCED THIS FILE, AND THAT WAS THE SECOND MISSING WIRE. The
 * byte-copy job has always demanded `--mapping <mapping.json>`, MIG-02 records
 * it as "the adapter's attachment output (filename -> tenant-prefixed
 * storage_path)", and no committed script emitted one. The bytes could not be
 * copied and therefore the attachment precondition could never be satisfied.
 *
 * THE FILENAME IS THE KEY AND IT IS PERSONAL DATA (CLAUDE.md: "Attachment
 * filenames may contain patient names"). This function RETURNS the mapping and
 * the caller WRITES IT TO DISK; nothing prints it, and the runbook keeps the
 * output file beside the delivery rather than in the repo.
 */
export function attachmentMapping(result: FisiozeroAdapterResult): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const r of result.records) {
    if (r.entityType !== "attachment") continue;
    const data = r.record.data as { fileName?: string; storagePath?: string };
    if (typeof data.fileName === "string" && typeof data.storagePath === "string") {
      mapping[data.fileName] = data.storagePath;
    }
  }
  return mapping;
}

/**
 * The byte-copy checkpoint, keyed by storage path - the evidence
 * `attachmentsWithoutObjects` reads before `--apply` writes any attachment row.
 *
 * ABSENT IS NOT EMPTY, and the difference decides a run. An empty Map makes
 * every attachment look un-uploaded and the run refuses, which is the correct
 * answer when the byte copy has not been run. A missing FILE is the same
 * finding, so it returns the same empty Map rather than throwing.
 */
export function readCheckpoint(file: string | null): Map<string, { status: string }> {
  const byPath = new Map<string, { status: string }>();
  if (!file || !fs.existsSync(file)) return byPath;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const e = JSON.parse(line) as { storagePath?: string; status?: string };
      if (typeof e.storagePath === "string") byPath.set(e.storagePath, { status: e.status ?? "" });
    } catch {
      // A truncated final line is expected after a kill -9. Skipping it makes
      // the entry read as un-uploaded, which refuses the run - the safe side.
    }
  }
  return byPath;
}

/* ====================================================================== */
/* THE INJECTED PIPELINE                                                   */
/* ====================================================================== */

type Pipeline = {
  stageRows(records: SourceRecord[]): Promise<SourceRecord[]>;
  validate(staged: SourceRecord[]): Promise<{ validated: number; failed: number }>;
  importRecords(entityType: string, batch: SourceRecord[]): Promise<{ imported: number }>;
  reconcile(): Promise<unknown>;
};

/**
 * ONE TRANSACTION PER PHASE, NOT ONE FOR THE WHOLE RUN, and the reason is the
 * ledger. `migration_staging_rows` is both the audit trail and the idempotency
 * key: a single transaction wrapping stage + import would roll the LEDGER back
 * alongside the failed import, so a re-run would have no record that the first
 * attempt happened and would repeat all of it. Committing each phase is what
 * makes the second `--apply` a no-op instead of a second import.
 *
 * `withTenantContext` AND NOT `getDbAdmin()`, deliberately. The admin handle
 * bypasses RLS. Running the import as an authenticated principal means
 * `migration_staging_rows`' tenant-isolation policies apply to every statement
 * of the rehearsal - so the rehearsal proves the policies too, rather than
 * proving only that the SQL is well formed.
 */
export function livePipeline(
  tenantId: string,
  batchId: string,
  resolvers: MigrationResolvers,
  actorId: string,
): Pipeline {
  const claims = { tenant_id: tenantId, user_role: "admin", sub: actorId };
  const tx = <T>(fn: (t: DbTx) => Promise<T>) => withTenantContext(claims, fn);

  /** (entityType|sourceId) -> ledger row id, from the stage call. */
  const ledgerIds = new Map<string, string>();
  const key = (entityType: string, sourceId: string) => `${entityType}|${sourceId}`;

  return {
    async stageRows(records) {
      const res = await tx((t) =>
        stageRows(
          t,
          tenantId,
          batchId,
          records.map((r) => ({
            sourceSystem: SOURCE_SYSTEM,
            entityType: r.entityType,
            sourceId: r.sourceId,
            raw: r.raw,
          })),
        ),
      );
      for (const row of res.rows) ledgerIds.set(key(row.entityType, row.sourceId), row.id);
      // The runner reports `staged.length`. Returning the INPUT rather than the
      // ledger rows keeps that number the number of records this run handed
      // over, which is what a re-run must reproduce exactly: `stageRows` is
      // idempotent on the unique key, so a second run stages the same set.
      return records;
    },

    async validate(staged) {
      /* ==============================================================
       * VALIDATION MUST WRITE THE LEDGER, NOT ONLY COMPUTE A VERDICT.
       * ==============================================================
       * `upsert.ts` reads `migration_staging_rows.status` and refuses any row
       * still `pending` with "import attempted before validation" - it does
       * not re-derive validity. A validate step that returned counts without
       * marking the rows would produce a clean PREVIEW and then fail EVERY
       * record on --apply, which is precisely the shape of failure a
       * rehearsal exists to find before the real delivery. */
      let validated = 0;
      let failed = 0;

      await tx(async (t) => {
        // ONLY `pending` ROWS ARE MARKED. `markValidated` throws unless the row
        // is currently pending, and on the idempotency re-run every row is
        // already `imported` - so marking blindly would turn the second
        // --apply into a crash instead of the no-op it is supposed to prove.
        const current = await t
          .select({
            id: migrationStagingRows.id,
            entityType: migrationStagingRows.entityType,
            sourceId: migrationStagingRows.sourceId,
            status: migrationStagingRows.status,
          })
          .from(migrationStagingRows)
          .where(
            and(
              eq(migrationStagingRows.tenantId, tenantId),
              eq(migrationStagingRows.sourceSystem, SOURCE_SYSTEM),
              eq(migrationStagingRows.batchId, batchId),
            ),
          );
        const statusByKey = new Map(current.map((r) => [key(r.entityType, r.sourceId), r]));

        for (const r of staged) {
          const row = statusByKey.get(key(r.entityType, r.sourceId));
          const detail = validateMigrationRecord(r.record);
          if (detail) {
            failed += 1;
            if (row && row.status === "pending") await markFailed(t, tenantId, row.id, detail);
            continue;
          }
          validated += 1;
          if (row && row.status === "pending") await markValidated(t, tenantId, row.id);
        }
      });

      return { validated, failed };
    },

    async importRecords(entityType, batch) {
      void (entityType as MigrationEntityType);
      const summary = await tx((t) =>
        importRecords(
          t,
          tenantId,
          SOURCE_SYSTEM,
          batch.map((r) => r.record),
          resolvers,
        ),
      );
      // INSERTED + UPDATED, NOT INSERTED ALONE. `importOne` returns "skipped"
      // for a re-run that changed nothing, so the second --apply reports
      // imported=0 with skipped carrying the count - which is exactly the
      // number the idempotency step is looking for.
      return { imported: summary.inserted + summary.updated };
    },

    async reconcile() {
      return tx((t) => generateReconciliationReport(t, tenantId, batchId));
    },
  };
}

/* ====================================================================== */
/* CLI                                                                     */
/* ====================================================================== */

/** The shape `run-import.mjs` exports. Declared because it is a `.mjs` module
 *  with no declaration file, and a dynamic import is otherwise `any` - which
 *  CLAUDE.md forbids without a reason. This IS the reason, and the shape is
 *  checked against the real module by the test suite. */
type RunImportModule = {
  CONFIRM_PHRASE: string;
  EXIT: { OK: number; FAILED: number; BAD_INVOCATION: number };
  runImport(args: Record<string, unknown>): Promise<{ exit: number }>;
};

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}
const has = (flag: string) => process.argv.includes(flag);

async function main(): Promise<void> {
  const runnerPath = path.resolve(import.meta.dirname, "../../../scripts/import/run-import.mjs");
  const runner = (await import(pathToFileURL(runnerPath).href)) as RunImportModule;
  const EXIT = runner.EXIT;

  const deliveryDir = arg("--delivery");
  const configFile = arg("--config");
  if (!deliveryDir || !configFile) {
    console.error(
      "usage: --delivery <dir> --config <mapping-config.local.json>\n" +
        "       [--emit-attachment-mapping <out.json>] [--dry-run]\n" +
        "       [--apply --confirm <phrase>] [--checkpoint <file.jsonl>]",
    );
    process.exit(EXIT.BAD_INVOCATION);
  }

  let config: MappingConfig;
  try {
    config = JSON.parse(fs.readFileSync(configFile, "utf8")) as MappingConfig;
  } catch (e) {
    console.error(`config unreadable: ${(e as Error).name}`);
    process.exit(EXIT.BAD_INVOCATION);
  }

  const tenantId = config.tenantId;
  if (!tenantId) {
    console.error("config is missing tenantId - see scripts/import/mapping-config.template.json");
    process.exit(EXIT.BAD_INVOCATION);
  }

  const emitTo = arg("--emit-attachment-mapping");
  const dryRun = has("--dry-run");
  const apply = has("--apply");

  /* -- THE GUARD, BEFORE THE ADAPTER AND BEFORE ANY CONNECTION -- */
  // Only when a database will actually be opened. --dry-run and
  // --emit-attachment-mapping touch none, so demanding DATABASE_URL for them
  // would make the two safest modes the hardest to run.
  if (!dryRun && !emitTo) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("DATABASE_URL is not set. Source the rehearsal env file first.");
      process.exit(EXIT.BAD_INVOCATION);
    }
    const ref = parseProjectRef(url);
    if (!ref) {
      console.error("SAFETY: could not parse a Supabase project ref from DATABASE_URL.");
      process.exit(EXIT.FAILED);
    }
    if (PROD_REFS.includes(ref)) {
      console.error(`SAFETY: refusing to run against blocklisted project ref (${ref}).`);
      process.exit(EXIT.FAILED);
    }
    console.log(`target project ref: ${ref}   (not on the ${PROD_REFS.length}-entry blocklist)`);
  }

  /* -- adapter -- */
  const delivery = readDelivery(deliveryDir);
  let adapterResult: FisiozeroAdapterResult;
  try {
    adapterResult = adaptFisiozeroDelivery(
      {
        pacientes: delivery.pacientes,
        marcacoes: delivery.marcacoes,
        episodios: delivery.episodios,
        documentos: delivery.documentos,
      },
      {
        tenantId,
        location: locationResolution(config),
        practitionerKeyByName: stripReadme(config.practitionerKeyByName),
        serviceKeyByType: stripReadme(config.serviceKeyByType),
      },
    );
  } catch (e) {
    // NAME ONLY, NEVER THE MESSAGE. An adapter error can quote the row that
    // broke it, and this output is pasted into a chat.
    console.error(`adapter failed: ${(e as Error).name}`);
    process.exit(EXIT.FAILED);
  }

  if (emitTo) {
    const mapping = attachmentMapping(adapterResult);
    fs.writeFileSync(emitTo, JSON.stringify(mapping, null, 2), "utf8");
    // THE COUNT, NEVER THE NAMES.
    console.log(`ATTACHMENT MAPPING WRITTEN`);
    console.log(`  entries    ${Object.keys(mapping).length}`);
    console.log(`  written to ${emitTo}`);
    process.exit(EXIT.OK);
  }

  const checkpointByPath = readCheckpoint(arg("--checkpoint"));
  const batchId = arg("--batch") ?? REHEARSAL_BATCH_ID;
  if (!dryRun && !isUuid(batchId)) {
    console.error(`--batch must be a uuid (migration_staging_rows.batch_id is uuid); got a non-uuid`);
    process.exit(EXIT.BAD_INVOCATION);
  }
  const pipeline = dryRun
    ? null
    : livePipeline(tenantId, batchId, buildResolvers(config), tenantId);

  const result = await runner.runImport({
    adapterResult,
    config,
    pipeline,
    checkpointByPath,
    apply,
    confirm: arg("--confirm"),
    dryRun,
  });

  // `process.exit` and not a pool drain. `packages/db` exposes no handle to
  // close (`getDbAdmin()` returns the drizzle object, not the postgres client),
  // and this is a one-shot CLI: exiting on the runner's own code is what makes
  // the exit status the deliverable CLAUDE.md says it is.
  process.exit(result.exit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(`FATAL: ${(e as Error).name}`);
    process.exit(1);
  });
}
