// packages/db/src/migration/upsert.ts
//
// Idempotent importer: normalized intermediate records → target tables.
//
// HOW IDEMPOTENCY WORKS
//   Target tables have no source_id column. The staging table doubles as the
//   ledger: unique (tenant_id, source_system, entity_type, source_id) with
//   imported_entity_id pointing at the created target row. Re-running an
//   import finds the ledger entry and UPDATEs (or, for clinical records,
//   SKIPS) instead of inserting — no duplicates, ever.
//
// EXECUTION CONTEXT
//   All functions take a DbTx from withTenantContext — the import runs as an
//   authenticated staff principal with admin/owner claims (clinical_records'
//   insert policy requires owner|admin|therapist), so RLS applies to every
//   statement. tenant_id is still written explicitly on every insert
//   (CLAUDE.md rule 3). Never supabase-js, never the BYPASSRLS admin handle.
//
// FAILURE ISOLATION
//   Each record imports inside a SAVEPOINT (nested tx.transaction); a failure
//   rolls back only that record, is persisted to the staging row as a
//   sanitized, PII-free error detail, and the batch continues — one bad row
//   never aborts the run.
//
// DUPLICATE PATIENTS
//   Fisiozero allows duplicate registrations (docs/migration-notes.md).
//   Dedupe is a human reconciliation decision, resolved with the EXISTING
//   public.merge_patients() SQL function via mergeImportedPatient below —
//   merge logic is deliberately NOT reimplemented here.

import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbTx } from "../client";
import {
  appointments,
  attachments,
  clinicalEpisodes,
  clinicalRecords,
  migrationStagingRows,
  patientLocations,
  patients,
} from "../schema";
import {
  markFailed,
  markImported,
  markImportedMany,
  MigrationStagingError,
  resolveImportedIds,
} from "./staging";
import type {
  MigrationAppointment,
  MigrationAttachment,
  MigrationClinicalEpisode,
  MigrationClinicalRecord,
  MigrationEntityType,
  MigrationErrorDetail,
  MigrationPatient,
  MigrationRecord,
  MigrationResolvers,
} from "./types";

export type ImportAction = "inserted" | "updated" | "skipped" | "failed";

export type ImportSummary = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Failures by (entityType, sourceId) — source ids are opaque, never PII. */
  failures: Array<{
    entityType: MigrationEntityType;
    sourceId: string;
    detail: MigrationErrorDetail;
  }>;
};

// Dependency order: parents before children, so ledger lookups for
// cross-record references always resolve within a single run.
const IMPORT_ORDER: MigrationEntityType[] = [
  "patient",
  "clinical_episode",
  "appointment",
  "clinical_record",
  "attachment",
];

/* ================================================================== */
/* MIG-08: BATCHED WRITES                                              */
/* ================================================================== */
/**
 * ROWS PER MULTI-ROW INSERT.
 *
 * THE NUMBER THIS EXISTS FOR. The 2026-08-26 rehearsal imported 2001 rows in
 * 19m30s - 1.7 rows/s, flat across every entity, which is the signature of
 * ROUND-TRIP LATENCY and not of any query. Each row cost about five round trips
 * to a pooler in Frankfurt: a savepoint, a resolver SELECT, the INSERT, the
 * ledger UPDATE, a release. The real delivery is 8,000-10,000 patients plus a
 * decade of history, on the one night the extraction cannot be repeated.
 *
 * 200 IS A TRADE, NOT A TUNING. A chunk is the unit that rolls back together,
 * so a bigger chunk means more good rows re-done by the per-row fallback when
 * one row is bad; a smaller one means more round trips. 200 keeps a 10,000-row
 * entity at 50 statements and keeps the worst-case fallback to 200 per-row
 * imports - about two minutes at the old rate, once.
 */
export const IMPORT_CHUNK_SIZE = 200;

/**
 * Per-run overrides. Additive and optional: every existing caller keeps today's
 * behaviour.
 *
 * `chunkSize <= 1` DISABLES CHUNKING ENTIRELY and puts every row on the per-row
 * path. That is not a tuning knob, it is the ESCAPE HATCH and the TEST SEAM:
 * the per-row path is what the chunked path must agree with row for row, and a
 * test that cannot run both cannot assert that. It is also what an operator
 * reaches for at 22:00 if chunking ever misbehaves on real data.
 */
export type ImportOptions = { chunkSize?: number };

/**
 * The imported-parent id maps a group needs, preloaded ONCE per entity group.
 *
 * WHAT IT REPLACES. `requireImportedRef` used to run one SELECT against
 * migration_staging_rows PER REFERENCE - so a clinical_record cost two SELECTs
 * before it inserted anything, and an attachment two more. Across the rehearsal
 * that was over 2,000 round trips spent asking the ledger questions whose
 * answers were already fixed by the time the group started.
 *
 * WHY IT IS SAFE TO PRELOAD. The map is loaded at the top of each entity group,
 * and IMPORT_ORDER guarantees every parent group has already finished. Nothing
 * inside a group can change a parent's imported id: a group only writes its own
 * entity's rows and its own ledger rows. So the answer cannot go stale between
 * the preload and the last row of the group.
 */
type ImportedRefs = Partial<Record<MigrationEntityType, Map<string, string>>>;

/** Which parent ledgers each entity's values resolve against. */
const REF_PARENTS: Record<MigrationEntityType, MigrationEntityType[]> = {
  patient: [],
  clinical_episode: ["patient"],
  appointment: ["patient"],
  clinical_record: ["patient", "clinical_episode"],
  attachment: ["patient", "clinical_record"],
};

/** The parent source ids one record references, per parent entity. */
function referencedSourceIds(rec: MigrationRecord, parent: MigrationEntityType): string[] {
  switch (rec.entityType) {
    case "patient":
      return [];
    case "clinical_episode":
    case "appointment":
      return parent === "patient" ? [rec.data.patientSourceId] : [];
    case "clinical_record":
      if (parent === "patient") return [rec.data.patientSourceId];
      if (parent === "clinical_episode" && rec.data.episodeSourceId)
        return [rec.data.episodeSourceId];
      return [];
    case "attachment":
      if (parent === "patient" && rec.data.patientSourceId) return [rec.data.patientSourceId];
      if (parent === "clinical_record" && rec.data.clinicalRecordSourceId)
        return [rec.data.clinicalRecordSourceId];
      return [];
  }
}

/**
 * PAGED, because a single `IN (...)` of ten thousand uuids is a megabyte of SQL
 * text for one answer. 1000 per statement keeps a 10k-parent group at ten round
 * trips, which is nothing beside the per-row SELECTs it replaces.
 */
const REF_PAGE = 1000;

async function preloadRefs(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  entityType: MigrationEntityType,
  group: MigrationRecord[],
): Promise<ImportedRefs> {
  const refs: ImportedRefs = {};
  for (const parent of REF_PARENTS[entityType]) {
    const ids = [...new Set(group.flatMap((rec) => referencedSourceIds(rec, parent)))];
    const map = new Map<string, string>();
    for (let i = 0; i < ids.length; i += REF_PAGE) {
      const page = await resolveImportedIds(
        tx,
        tenantId,
        sourceSystem,
        parent,
        ids.slice(i, i + REF_PAGE),
      );
      for (const [k, v] of page) map.set(k, v);
    }
    refs[parent] = map;
  }
  return refs;
}

/**
 * Resolve one cross-record reference from the preloaded map. PURE - it opens no
 * transaction and issues no statement, which is what lets the value builders
 * below run OUTSIDE a savepoint and a chunk be assembled before anything is
 * written.
 *
 * The refusal is byte-identical to the one the per-row SELECT produced: same
 * code, same field, same message. A row whose parent did not import is failed
 * with `unresolved_reference` exactly as before - it simply never enters a
 * chunk, so one orphan cannot roll back 199 good rows.
 */
function resolveRef(
  refs: ImportedRefs,
  entityType: MigrationEntityType,
  sourceId: string,
  field: string,
): string {
  const id = refs[entityType]?.get(sourceId);
  if (!id)
    throw unresolved(field, `referenced ${entityType} is not imported (orphan reference)`);
  return id;
}

/**
 * Import a set of normalized records. Records must already be STAGED and
 * VALIDATED (see staging.ts / validate.ts); anything else is failed or
 * skipped, never guessed at. Safe to re-run with the same input: ledger hits
 * become updates (clinical records: skips), and the summary shows 0 inserted.
 */
export async function importRecords(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  records: MigrationRecord[],
  resolvers: MigrationResolvers,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const chunkSize = options.chunkSize ?? IMPORT_CHUNK_SIZE;
  const summary: ImportSummary = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  const byType = new Map<MigrationEntityType, MigrationRecord[]>();
  for (const rec of records) {
    const group = byType.get(rec.entityType) ?? [];
    group.push(rec);
    byType.set(rec.entityType, group);
  }

  for (const entityType of IMPORT_ORDER) {
    const group = byType.get(entityType);
    if (!group || group.length === 0) continue;

    const staging = await loadStagingRows(
      tx,
      tenantId,
      sourceSystem,
      entityType,
      group.map((r) => r.data.sourceId),
    );

    // A1: ONE SELECT PER PARENT, HERE, AND NONE INSIDE THE LOOP.
    const refs = await preloadRefs(tx, tenantId, sourceSystem, entityType, group);

    /**
     * Rows that will go through a multi-row INSERT, in ledger order.
     * `perRow` runs the existing one-at-a-time path and is the fallback.
     */
    const chunkable: PreparedRow[] = [];
    const perRow: Array<{ rec: MigrationRecord; st: StagingRow }> = [];

    for (const rec of group) {
      const st = staging.get(rec.data.sourceId);
      const fail = (detail: MigrationErrorDetail) => {
        summary.failed += 1;
        summary.failures.push({ entityType, sourceId: rec.data.sourceId, detail });
      };

      if (!st) {
        fail({
          code: "invalid_transition",
          message: "record was never staged — stage and validate before import",
        });
        continue;
      }

      // A `failed` row is SKIPPED HERE, AND IT IS NOT THEREBY ABANDONED.
      //
      // RECOVERY IS RE-STAGE PLUS RE-VALIDATE, ruled 2026-08-26 after the
      // rehearsal proved it on live data. A full run stages every record before
      // it imports any, and `stageRows`' ON CONFLICT sets a row's status back to
      // `pending` unless it is already `imported` (staging.ts). Validate then
      // moves every `pending` row to `validated`, and this loop imports it. So
      // by the time control reaches here in a full re-run, a row that failed on
      // the previous run is `validated`, not `failed` - which is why the 61
      // appointments and 44 clinical_records lost to the 2026-08-26 apply
      // recovered on the next identical command, all 105 of them.
      //
      // THERE WAS A RETRY GATE HERE AND IT WAS DEAD CODE. It re-attempted a
      // `failed` row in place and counted it on a `RETRIED n` line. Nothing
      // could reach it: the only caller that reaches this loop is the runner,
      // and the runner always stages first. Its RETRIED line printed `0` on the
      // one run built to exercise it, which is how the deadness was found.
      //
      // WHAT THIS SKIP STILL COVERS is the caller that imports WITHOUT staging
      // first - a targeted re-import of one batch. There, `failed` means the
      // previous attempt's verdict stands and this loop will not quietly
      // overturn it.
      //
      // A ROW REJECTED BY VALIDATION IS REJECTED AGAIN, and that is the same
      // sentence in both worlds. Re-staging resets it to `pending`, validate
      // rejects it on the identical record and marks it `failed` again, and it
      // never reaches this loop. Nothing short of a CHANGED DELIVERY imports
      // it, which is the correct answer: `validation_failed` means the record
      // cannot be written as it stands.
      if (st.status === "failed") {
        summary.skipped += 1;
        continue;
      }

      // ALREADY IMPORTED: SKIP, FOR EVERY ENTITY. ZERO WRITES.
      //
      // Ruled 2026-08-26. This used to fall through to `importOne`, where every
      // entity except clinical_record took an UPDATE path on
      // `ledger.importedEntityId` and returned "updated" - so the second
      // `--apply` re-wrote all 2001 target rows and reported them as imported.
      // REHEARSAL.md §7.3 and PROD-RUN.md §6 both describe that run as writing
      // nothing, and `import-core.ts` sums inserted + updated, so the
      // idempotency proof would have shown the full count where it promised 0.
      //
      // A no-op is the correct answer here: the ledger already holds the target
      // row's uuid, nothing about the delivery has changed, and re-writing a
      // migrated clinical row would falsify history rather than confirm it.
      if (st.status === "imported") {
        summary.skipped += 1;
        continue;
      }

      if (st.status === "pending") {
        const detail: MigrationErrorDetail = {
          code: "invalid_transition",
          message: "import attempted before validation (status was 'pending')",
        };
        await markFailed(tx, tenantId, st.id, detail);
        fail(detail);
        continue;
      }

      // st.status is 'validated' - 'imported', 'failed' and 'pending' were all
      // handled above. So the per-entity UPDATE path below is reached ONLY for a
      // `validated` row that already carries an importedEntityId - the shape a
      // re-staged, re-validated row takes after an earlier import.

      // ---- MIG-08: which path this row takes ----------------------------
      //
      // A ROW LEAVES THE CHUNKED PATH FOR THREE REASONS, and all three are
      // decided HERE, before anything is written:
      //
      //   1. IT IS NOT AN INSERT. A `validated` row carrying an
      //      importedEntityId takes the per-entity UPDATE path (or, for a
      //      clinical_record, a skip). A multi-row INSERT cannot express that.
      //   2. IT IS AN UNNUMBERED PATIENT (A4). 0029's assign_patient_number
      //      fills patient_number with COALESCE(MAX(...),0)+1 per statement, so
      //      a chunk of unnumbered rows would have every row in it read the
      //      same MAX. They stay one statement per row, after every numbered
      //      row, which is B5's ordering unchanged.
      //   3. ITS VALUES DO NOT RESOLVE. An unmapped key or an unimported
      //      parent throws while the chunk is being assembled. That row is
      //      failed on the spot with the same `unresolved_reference` detail the
      //      per-row path produced - and, crucially, it never enters a chunk,
      //      so one orphan cannot roll back 199 good rows.
      if (chunkSize <= 1 || st.importedEntityId || isUnnumberedPatient(rec)) {
        perRow.push({ rec, st });
        continue;
      }

      let prepared: PreparedRow;
      try {
        prepared = prepareRow(rec, st, resolvers, refs);
      } catch (err) {
        const detail = sanitizeImportError(err);
        await markFailed(tx, tenantId, st.id, detail);
        fail(detail);
        continue;
      }
      chunkable.push(prepared);
    }

    /* ---- the chunked path, then the per-row remainder ---------------- */
    for (let i = 0; i < chunkable.length; i += chunkSize) {
      const chunk = chunkable.slice(i, i + chunkSize);
      try {
        await tx.transaction(async (sp) => {
          await insertChunk(sp, tenantId, entityType, chunk);
          await markImportedMany(
            sp,
            tenantId,
            chunk.map((c) => ({ stagingRowId: c.st.id, importedEntityId: c.id })),
          );
        });
        summary.inserted += chunk.length;
      } catch {
        // A3: ROLL BACK TO THE CHUNK SAVEPOINT, THEN GO ROW BY ROW.
        //
        // `tx.transaction` opened a SAVEPOINT and has already rolled back to it,
        // so nothing this chunk wrote survives and the ledger is untouched. The
        // error is DELIBERATELY NOT recorded against any row here: it belongs to
        // whichever row actually caused it, and the only way to learn which is
        // to import them one at a time. Each row then gets its own savepoint,
        // its own sqlstate and constraint through `sanitizeImportError`, and its
        // own ledger verdict - exactly what the per-row path always did.
        //
        // SO A CHUNK FALLBACK IS INVISIBLE IN THE SUMMARY except as time: the
        // good rows land as `inserted`, the bad one lands as `failed` with its
        // detail, and the counts are the counts the per-row path would have
        // produced.
        for (const c of chunk) {
          await importRowByRow(
            tx,
            tenantId,
            entityType,
            c.rec,
            c.st,
            resolvers,
            refs,
            summary,
          );
        }
      }
    }

    for (const { rec, st } of perRow) {
      await importRowByRow(tx, tenantId, entityType, rec, st, resolvers, refs, summary);
    }
  }

  return summary;
}

/** The one-at-a-time import: one savepoint, one row, one ledger verdict. */
async function importRowByRow(
  tx: DbTx,
  tenantId: string,
  entityType: MigrationEntityType,
  rec: MigrationRecord,
  st: StagingRow,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
  summary: ImportSummary,
): Promise<void> {
  try {
    const action = await tx.transaction(async (sp) => {
      return importOne(sp, tenantId, rec, resolvers, refs, {
        stagingRowId: st.id,
        importedEntityId: st.importedEntityId,
      });
    });
    summary[action] += 1;
  } catch (err) {
    const detail = sanitizeImportError(err);
    // markFailed transitions pending|validated|failed; on a re-run failure
    // of an already-imported row it stays 'imported' and the failure is
    // reported in the summary.
    if (st.status === "validated") {
      await markFailed(tx, tenantId, st.id, detail);
    }
    summary.failed += 1;
    summary.failures.push({ entityType, sourceId: rec.data.sourceId, detail });
  }
}

/* ================================================================== */
/* Per-entity import                                                   */
/* ================================================================== */

type LedgerState = {
  stagingRowId: string;
  importedEntityId: string | null;
};

async function importOne(
  tx: DbTx,
  tenantId: string,
  rec: MigrationRecord,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
  ledger: LedgerState,
): Promise<Exclude<ImportAction, "failed">> {
  switch (rec.entityType) {
    case "patient":
      return importPatient(tx, tenantId, rec.data, resolvers, ledger);
    case "appointment":
      return importAppointment(tx, tenantId, rec.data, resolvers, refs, ledger);
    case "clinical_episode":
      return importEpisode(tx, tenantId, rec.data, resolvers, refs, ledger);
    case "clinical_record":
      return importClinicalRecord(tx, tenantId, rec.data, resolvers, refs, ledger);
    case "attachment":
      return importAttachment(tx, tenantId, rec.data, refs, ledger);
  }
}

/* ------------------------------------------------------------------ *
 * CHUNK ASSEMBLY                                                        *
 * ------------------------------------------------------------------ */

type StagingRow = { id: string; status: string; importedEntityId: string | null };

/**
 * One row, resolved and ready to insert.
 *
 * `id` IS GENERATED HERE, IN JS, RATHER THAN BY THE DATABASE, and that is the
 * whole reason a chunk can be written in one statement. The ledger UPDATE needs
 * to pair each staging row with the target row it created; with a server-side
 * default the only way to recover that pairing from a multi-row INSERT is to
 * trust that `RETURNING` comes back in VALUES order - which Postgres does not
 * promise and which nothing in the result would reveal if it ever stopped being
 * true. Knowing the uuid before the INSERT makes the pairing a fact rather than
 * an inference, and `RETURNING id` is then a CHECK on it instead of the source
 * of it. Every one of these tables declares `id uuid primary key
 * defaultRandom()`, so supplying it is ordinary.
 */
type PreparedRow = {
  rec: MigrationRecord;
  st: StagingRow;
  id: string;
  values: PatientInsert | AppointmentInsert | EpisodeInsert | ClinicalRecordInsert | AttachmentInsert;
  /** patients only: the patient_locations rows this patient needs. */
  locationIds?: string[];
};

/** A4: a patient with no vendor number must let 0029's trigger assign one. */
function isUnnumberedPatient(rec: MigrationRecord): boolean {
  return rec.entityType === "patient" && typeof rec.data.patientNumber !== "number";
}

function prepareRow(
  rec: MigrationRecord,
  st: StagingRow,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
): PreparedRow {
  const id = randomUUID();
  switch (rec.entityType) {
    case "patient": {
      const { values, locationIds } = patientValues(rec.data, resolvers);
      return { rec, st, id, values, locationIds };
    }
    case "appointment":
      return { rec, st, id, values: appointmentValues(rec.data, resolvers, refs) };
    case "clinical_episode":
      return { rec, st, id, values: episodeValues(rec.data, resolvers, refs) };
    case "clinical_record":
      return { rec, st, id, values: clinicalRecordValues(rec.data, resolvers, refs) };
    case "attachment":
      return { rec, st, id, values: attachmentValues(rec.data, refs) };
  }
}

/**
 * The multi-row INSERT for one chunk, plus the patients' location links.
 *
 * `RETURNING id` IS VERIFIED, NOT USED. The ids were decided in `prepareRow`;
 * this asserts the database created exactly those rows and no others. A
 * mismatch means an assumption broke somewhere between here and the wire, and
 * throwing sends the chunk to the per-row fallback rather than letting a wrong
 * pairing reach the ledger.
 *
 * ONE CAST PER BRANCH, and it is narrowing rather than `any`: `values` is the
 * union of the five builders' return types, and the switch has already
 * established which one this is. The SHAPE is pinned by the builder's own
 * return type - the same function the per-row path calls - so the cast cannot
 * drift from what actually gets written.
 */
async function insertChunk(
  sp: DbTx,
  tenantId: string,
  entityType: MigrationEntityType,
  chunk: PreparedRow[],
): Promise<void> {
  const expected = chunk.length;
  let returned: Array<{ id: string }>;

  switch (entityType) {
    case "patient": {
      returned = await sp
        .insert(patients)
        .values(chunk.map((c) => ({ id: c.id, tenantId, ...(c.values as PatientInsert) })))
        .returning({ id: patients.id });
      const links = chunk.flatMap((c) =>
        (c.locationIds ?? []).map((locationId) => ({
          tenantId,
          patientId: c.id,
          locationId,
        })),
      );
      if (links.length > 0) {
        await sp.insert(patientLocations).values(links).onConflictDoNothing();
      }
      break;
    }
    case "appointment":
      returned = await sp
        .insert(appointments)
        .values(chunk.map((c) => ({ id: c.id, tenantId, ...(c.values as AppointmentInsert) })))
        .returning({ id: appointments.id });
      break;
    case "clinical_episode":
      returned = await sp
        .insert(clinicalEpisodes)
        .values(chunk.map((c) => ({ id: c.id, tenantId, ...(c.values as EpisodeInsert) })))
        .returning({ id: clinicalEpisodes.id });
      break;
    case "clinical_record":
      returned = await sp
        .insert(clinicalRecords)
        .values(
          chunk.map((c) => ({ id: c.id, tenantId, ...(c.values as ClinicalRecordInsert) })),
        )
        .returning({ id: clinicalRecords.id });
      break;
    case "attachment":
      returned = await sp
        .insert(attachments)
        .values(chunk.map((c) => ({ id: c.id, tenantId, ...(c.values as AttachmentInsert) })))
        .returning({ id: attachments.id });
      break;
  }

  const got = new Set(returned.map((r) => r.id));
  if (returned.length !== expected || chunk.some((c) => !got.has(c.id))) {
    const message =
      `chunk INSERT into ${entityType} returned ${returned.length} row(s) for ${expected} ` +
      `prepared, or returned an id that was not supplied`;
    throw new MigrationStagingError(message, { code: "import_failed", message });
  }
}

/* ------------------------------------------------------------------ *
 * VALUE BUILDERS.                                                      *
 *                                                                      *
 * ONE DEFINITION PER ENTITY, USED BY BOTH PATHS. The chunked path and   *
 * the per-row fallback must write the same columns from the same        *
 * source row, and the only way to guarantee that is for there to be one *
 * function that decides. A second copy would drift the day somebody     *
 * fixes one and not the other, and the fallback runs precisely when     *
 * something has already gone wrong - the worst moment to discover the   *
 * two paths disagree.                                                   *
 *                                                                      *
 * EVERY BUILDER IS PURE and throws `unresolved(...)` for a key or a     *
 * parent it cannot resolve. Nothing here opens a transaction, so a      *
 * chunk can be assembled - and its unresolvable rows failed one by one  *
 * - before a single byte is written.                                    *
 * ------------------------------------------------------------------ */

type PatientInsert = Omit<typeof patients.$inferInsert, "id" | "tenantId">;
type AppointmentInsert = Omit<typeof appointments.$inferInsert, "id" | "tenantId">;
type EpisodeInsert = Omit<typeof clinicalEpisodes.$inferInsert, "id" | "tenantId">;
type ClinicalRecordInsert = Omit<typeof clinicalRecords.$inferInsert, "id" | "tenantId">;
type AttachmentInsert = Omit<typeof attachments.$inferInsert, "id" | "tenantId">;

function patientValues(
  p: MigrationPatient,
  resolvers: MigrationResolvers,
): { values: PatientInsert; locationIds: string[] } {
  const locationIds = p.locationKeys.map((key) => {
    const id = resolvers.locationIdByKey[key];
    if (!id) throw unresolved("locationKeys", "location key has no resolver entry");
    return id;
  });

  // The primary clinic. Resolved through the same map as `locationKeys` and
  // REQUIRED on the intermediate shape, so a patient can never be imported
  // without one: PL-09 makes an UNPLACED patient looser rather than tighter -
  // patientLocationScope falls back to unrestricted - so thousands of imported
  // rows with a null primary location would be visible more widely than the
  // clinic expects, quietly.
  const primaryLocationId = resolvers.locationIdByKey[p.primaryLocationKey];
  if (!primaryLocationId) {
    throw unresolved("primaryLocationKey", "primary location key has no resolver entry");
  }

  const values = {
    fullName: p.fullName,
    dateOfBirth: p.dateOfBirth ?? null,
    sex: p.sex ?? null,
    nif: p.nif ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    address: p.address ?? null,
    postalCode: p.postalCode ?? null,
    city: p.city ?? null,
    notes: p.notes ?? null,
    primaryLocationId,
    // PL-23 (0051): a LIST, because a patient may hold ADSE and a private
    // insurer at once. NOT NULL DEFAULT '[]', so the fallback is the empty
    // array and never a null.
    healthInsuranceNumbers: p.healthInsuranceNumbers ?? [],
    // OWNER RULING 2026-08-24: THE VENDOR NUMBER IS AUTHORITATIVE.
    //
    // Supplying it EXPLICITLY is what preserves it, and it is also what makes
    // the trigger stand down: 0029's assign_patient_number only fills the
    // column `IF NEW.patient_number IS NULL`, and its own comment says
    // "Explicit values skip this path entirely (keep original numbers)".
    //
    // OMITTING THE KEY IS NOT THE SAME AS PASSING NULL, and that is the whole
    // subtlety here. The column is `integer NOT NULL DEFAULT sql\`null\``, a
    // type-level marker letting callers leave it out so the trigger can fill
    // it. So a patient with no vendor number must have the key ABSENT, not set
    // to null - which is why this is spread conditionally rather than written
    // as `patientNumber: p.patientNumber ?? null`.
    ...(typeof p.patientNumber === "number" ? { patientNumber: p.patientNumber } : {}),
    // The source registration date, into created_at. Same conditional-spread
    // shape as importClinicalRecord uses for recordedAt, and for the same
    // reason: created_at is NOT NULL DEFAULT now(), so a patient with no source
    // date must have the key ABSENT and let the default stand - passing null
    // would be rejected, and passing new Date() would silently stamp import day
    // onto a patient the clinic has had for a decade.
    ...(p.registeredAt ? { createdAt: new Date(p.registeredAt) } : {}),
  };

  return { values, locationIds };
}

async function importPatient(
  tx: DbTx,
  tenantId: string,
  p: MigrationPatient,
  resolvers: MigrationResolvers,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const { values, locationIds } = patientValues(p, resolvers);

  let patientId: string;
  let action: "inserted" | "updated";

  if (ledger.importedEntityId) {
    patientId = ledger.importedEntityId;
    await tx
      .update(patients)
      .set(values)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)));
    action = "updated";
  } else {
    const [row] = await tx
      .insert(patients)
      .values({ tenantId, ...values })
      .returning({ id: patients.id });
    patientId = row!.id;
    await markImported(tx, tenantId, ledger.stagingRowId, patientId);
    action = "inserted";
  }

  if (locationIds.length > 0) {
    await tx
      .insert(patientLocations)
      .values(locationIds.map((locationId) => ({ tenantId, patientId, locationId })))
      .onConflictDoNothing();
  }

  return action;
}

function appointmentValues(
  a: MigrationAppointment,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
): AppointmentInsert {
  const patientId = resolveRef(refs, "patient", a.patientSourceId, "patientSourceId");
  const practitionerId = resolvers.practitionerIdByKey[a.practitionerKey];
  if (!practitionerId)
    throw unresolved("practitionerKey", "practitioner key has no resolver entry");
  const locationId = resolvers.locationIdByKey[a.locationKey];
  if (!locationId) throw unresolved("locationKey", "location key has no resolver entry");
  const serviceId = a.serviceKey ? (resolvers.serviceIdByKey?.[a.serviceKey] ?? null) : null;
  if (a.serviceKey && !serviceId)
    throw unresolved("serviceKey", "service key has no resolver entry");

  return {
    patientId,
    practitionerId,
    locationId,
    serviceId,
    startsAt: new Date(a.startsAt),
    endsAt: new Date(a.endsAt),
    status: a.status,
    notes: a.notes ?? null,
  };
}

async function importAppointment(
  tx: DbTx,
  tenantId: string,
  a: MigrationAppointment,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const values = appointmentValues(a, resolvers, refs);

  if (ledger.importedEntityId) {
    await tx
      .update(appointments)
      .set(values)
      .where(
        and(eq(appointments.tenantId, tenantId), eq(appointments.id, ledger.importedEntityId)),
      );
    return "updated";
  }

  const [row] = await tx
    .insert(appointments)
    .values({ tenantId, ...values })
    .returning({ id: appointments.id });
  await markImported(tx, tenantId, ledger.stagingRowId, row!.id);
  return "inserted";
}

function episodeValues(
  e: MigrationClinicalEpisode,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
): EpisodeInsert {
  const patientId = resolveRef(refs, "patient", e.patientSourceId, "patientSourceId");
  let primaryPractitionerId: string | null = null;
  if (e.practitionerKey) {
    primaryPractitionerId = resolvers.practitionerIdByKey[e.practitionerKey] ?? null;
    if (!primaryPractitionerId)
      throw unresolved("practitionerKey", "practitioner key has no resolver entry");
  }

  return {
    patientId,
    primaryPractitionerId,
    title: e.title,
    status: e.status,
    openedAt: new Date(e.openedAt),
    closedAt: e.closedAt ? new Date(e.closedAt) : null,
  };
}

async function importEpisode(
  tx: DbTx,
  tenantId: string,
  e: MigrationClinicalEpisode,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const values = episodeValues(e, resolvers, refs);

  if (ledger.importedEntityId) {
    await tx
      .update(clinicalEpisodes)
      .set(values)
      .where(
        and(
          eq(clinicalEpisodes.tenantId, tenantId),
          eq(clinicalEpisodes.id, ledger.importedEntityId),
        ),
      );
    return "updated";
  }

  const [row] = await tx
    .insert(clinicalEpisodes)
    .values({ tenantId, ...values })
    .returning({ id: clinicalEpisodes.id });
  await markImported(tx, tenantId, ledger.stagingRowId, row!.id);
  return "inserted";
}

function clinicalRecordValues(
  r: MigrationClinicalRecord,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
): ClinicalRecordInsert {
  const patientId = resolveRef(refs, "patient", r.patientSourceId, "patientSourceId");
  let episodeId: string | null = null;
  if (r.episodeSourceId) {
    episodeId = resolveRef(refs, "clinical_episode", r.episodeSourceId, "episodeSourceId");
  }
  let practitionerId: string | null = null;
  if (r.practitionerKey) {
    practitionerId = resolvers.practitionerIdByKey[r.practitionerKey] ?? null;
    if (!practitionerId)
      throw unresolved("practitionerKey", "practitioner key has no resolver entry");
  }

  return {
    patientId,
    episodeId,
    practitionerId,
    data: r.data,
    status: r.status,
    // Provenance: 'manual' until an owner decision on a dedicated source
    // tag (docs/QUESTIONS.md); the staging ledger already records origin.
    source: "manual",
    ...(r.recordedAt ? { createdAt: new Date(r.recordedAt) } : {}),
  };
}

async function importClinicalRecord(
  tx: DbTx,
  tenantId: string,
  r: MigrationClinicalRecord,
  resolvers: MigrationResolvers,
  refs: ImportedRefs,
  ledger: LedgerState,
): Promise<"inserted" | "skipped"> {
  // Already imported → SKIP, never update. Migrated clinical history is
  // treated as immutable regardless of record_status — a locked row would be
  // rejected by the immutability trigger anyway, and silently rewriting a
  // migrated draft would falsify clinical history.
  if (ledger.importedEntityId) return "skipped";

  const [row] = await tx
    .insert(clinicalRecords)
    .values({ tenantId, ...clinicalRecordValues(r, resolvers, refs) })
    .returning({ id: clinicalRecords.id });
  await markImported(tx, tenantId, ledger.stagingRowId, row!.id);
  return "inserted";
}

function attachmentValues(a: MigrationAttachment, refs: ImportedRefs): AttachmentInsert {
  const patientId = a.patientSourceId
    ? resolveRef(refs, "patient", a.patientSourceId, "patientSourceId")
    : null;
  const clinicalRecordId = a.clinicalRecordSourceId
    ? resolveRef(refs, "clinical_record", a.clinicalRecordSourceId, "clinicalRecordSourceId")
    : null;

  return {
    patientId,
    clinicalRecordId,
    storagePath: a.storagePath,
    fileName: a.fileName,
    mimeType: a.mimeType ?? null,
    sizeBytes: a.sizeBytes ?? null,
  };
}

async function importAttachment(
  tx: DbTx,
  tenantId: string,
  a: MigrationAttachment,
  refs: ImportedRefs,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const values = attachmentValues(a, refs);

  if (ledger.importedEntityId) {
    await tx
      .update(attachments)
      .set(values)
      .where(
        and(eq(attachments.tenantId, tenantId), eq(attachments.id, ledger.importedEntityId)),
      );
    return "updated";
  }

  const [row] = await tx
    .insert(attachments)
    .values({ tenantId, ...values })
    .returning({ id: attachments.id });
  await markImported(tx, tenantId, ledger.stagingRowId, row!.id);
  return "inserted";
}

/* ================================================================== */
/* Patient dedupe — delegate to the existing SQL function              */
/* ================================================================== */

/**
 * Merge a migrated duplicate into the surviving patient using the EXISTING
 * public.merge_patients() (migration 0005) — re-points dependents, soft-
 * deletes the source, writes the audit row. Tenant scope comes from the JWT
 * claims withTenantContext set; calling this outside a tenant context aborts
 * inside the function. Merge logic is intentionally not reimplemented here.
 */
export async function mergeImportedPatient(
  tx: DbTx,
  params: { sourcePatientId: string; targetPatientId: string; actorId?: string | null },
): Promise<unknown> {
  const result = await tx.execute(
    sql`select public.merge_patients(
      ${params.sourcePatientId}::uuid,
      ${params.targetPatientId}::uuid,
      ${params.actorId ?? null}::uuid
    ) as merged`,
  );
  return (result as unknown as Array<{ merged: unknown }>)[0]?.merged;
}

/* ================================================================== */
/* Internals                                                           */
/* ================================================================== */

async function loadStagingRows(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  entityType: MigrationEntityType,
  sourceIds: string[],
): Promise<
  Map<string, { id: string; status: string; importedEntityId: string | null }>
> {
  const rows = await tx
    .select({
      id: migrationStagingRows.id,
      sourceId: migrationStagingRows.sourceId,
      status: migrationStagingRows.status,
      importedEntityId: migrationStagingRows.importedEntityId,
    })
    .from(migrationStagingRows)
    .where(
      and(
        eq(migrationStagingRows.tenantId, tenantId),
        eq(migrationStagingRows.sourceSystem, sourceSystem),
        eq(migrationStagingRows.entityType, entityType),
        inArray(migrationStagingRows.sourceId, sourceIds),
      ),
    );
  return new Map(rows.map((r) => [r.sourceId, r]));
}

function unresolved(field: string, message: string): MigrationStagingError {
  return new MigrationStagingError(message, {
    code: "unresolved_reference",
    message,
    fields: [field],
  });
}

/**
 * Convert an arbitrary import error into a PII-FREE detail. Postgres error
 * messages can embed row values (e.g. unique-violation DETAIL), so only the
 * SQLSTATE code and constraint name are kept — never err.message from the
 * driver. Our own MigrationStagingError messages are value-free by contract.
 */
export function sanitizeImportError(err: unknown): MigrationErrorDetail {
  if (err instanceof MigrationStagingError) return err.errorDetail;

  // WALK THE CAUSE CHAIN. Drizzle wraps every driver failure in a
  // `DrizzleQueryError` that carries NEITHER `code` NOR `constraint_name`; the
  // `PostgresError` holding both sits at `.cause`. Reading the outer object
  // alone produced the bare string "database error" for all 162 failures of the
  // 2026-08-26 rehearsal, so the one instruction the runbook gives on failure -
  // "the reason is in migration_staging_rows.error_detail" - named nothing.
  //
  // FIELDS ONLY, NEVER A MESSAGE. A Postgres message and its DETAIL embed the
  // offending cell values (a unique violation prints the key), and this string
  // is written to the ledger and pasted into chats. Class, SQLSTATE and
  // constraint name are all structural.
  let cursor: unknown = err;
  let errorClass: string | undefined;
  let sqlstate: string | undefined;
  let constraint: string | undefined;
  for (let depth = 0; cursor && depth < 8; depth += 1) {
    const layer = cursor as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    const name = (cursor as { constructor?: { name?: string } })?.constructor?.name;
    // The class we keep is the one that CARRIED the sqlstate: that is the
    // driver error, and it is the layer worth naming.
    if (typeof layer.code === "string" && sqlstate === undefined) {
      sqlstate = layer.code;
      errorClass = name;
    }
    if (typeof layer.constraint_name === "string" && constraint === undefined) {
      constraint = layer.constraint_name;
    }
    if (errorClass === undefined && depth === 0 && typeof name === "string") errorClass = name;
    cursor = layer.cause;
  }

  const parts = ["database error"];
  if (errorClass) parts.push(`class ${errorClass}`);
  if (sqlstate) parts.push(`sqlstate ${sqlstate}`);
  if (constraint) parts.push(`constraint ${constraint}`);
  return { code: "import_failed", message: parts.join(", ") };
}
