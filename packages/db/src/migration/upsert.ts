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
import { markFailed, markImported, MigrationStagingError, resolveImportedIds } from "./staging";
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
): Promise<ImportSummary> {
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
      try {
        const action = await tx.transaction(async (sp) => {
          return importOne(sp, tenantId, sourceSystem, rec, resolvers, {
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
        fail(detail);
      }
    }
  }

  return summary;
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
  sourceSystem: string,
  rec: MigrationRecord,
  resolvers: MigrationResolvers,
  ledger: LedgerState,
): Promise<Exclude<ImportAction, "failed">> {
  switch (rec.entityType) {
    case "patient":
      return importPatient(tx, tenantId, rec.data, resolvers, ledger);
    case "appointment":
      return importAppointment(tx, tenantId, sourceSystem, rec.data, resolvers, ledger);
    case "clinical_episode":
      return importEpisode(tx, tenantId, sourceSystem, rec.data, resolvers, ledger);
    case "clinical_record":
      return importClinicalRecord(tx, tenantId, sourceSystem, rec.data, resolvers, ledger);
    case "attachment":
      return importAttachment(tx, tenantId, sourceSystem, rec.data, ledger);
  }
}

async function importPatient(
  tx: DbTx,
  tenantId: string,
  p: MigrationPatient,
  resolvers: MigrationResolvers,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
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

async function importAppointment(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  a: MigrationAppointment,
  resolvers: MigrationResolvers,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const patientId = await requireImportedRef(
    tx,
    tenantId,
    sourceSystem,
    "patient",
    a.patientSourceId,
    "patientSourceId",
  );
  const practitionerId = resolvers.practitionerIdByKey[a.practitionerKey];
  if (!practitionerId)
    throw unresolved("practitionerKey", "practitioner key has no resolver entry");
  const locationId = resolvers.locationIdByKey[a.locationKey];
  if (!locationId) throw unresolved("locationKey", "location key has no resolver entry");
  const serviceId = a.serviceKey ? (resolvers.serviceIdByKey?.[a.serviceKey] ?? null) : null;
  if (a.serviceKey && !serviceId)
    throw unresolved("serviceKey", "service key has no resolver entry");

  const values = {
    patientId,
    practitionerId,
    locationId,
    serviceId,
    startsAt: new Date(a.startsAt),
    endsAt: new Date(a.endsAt),
    status: a.status,
    notes: a.notes ?? null,
  };

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

async function importEpisode(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  e: MigrationClinicalEpisode,
  resolvers: MigrationResolvers,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const patientId = await requireImportedRef(
    tx,
    tenantId,
    sourceSystem,
    "patient",
    e.patientSourceId,
    "patientSourceId",
  );
  let primaryPractitionerId: string | null = null;
  if (e.practitionerKey) {
    primaryPractitionerId = resolvers.practitionerIdByKey[e.practitionerKey] ?? null;
    if (!primaryPractitionerId)
      throw unresolved("practitionerKey", "practitioner key has no resolver entry");
  }

  const values = {
    patientId,
    primaryPractitionerId,
    title: e.title,
    status: e.status,
    openedAt: new Date(e.openedAt),
    closedAt: e.closedAt ? new Date(e.closedAt) : null,
  };

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

async function importClinicalRecord(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  r: MigrationClinicalRecord,
  resolvers: MigrationResolvers,
  ledger: LedgerState,
): Promise<"inserted" | "skipped"> {
  // Already imported → SKIP, never update. Migrated clinical history is
  // treated as immutable regardless of record_status — a locked row would be
  // rejected by the immutability trigger anyway, and silently rewriting a
  // migrated draft would falsify clinical history.
  if (ledger.importedEntityId) return "skipped";

  const patientId = await requireImportedRef(
    tx,
    tenantId,
    sourceSystem,
    "patient",
    r.patientSourceId,
    "patientSourceId",
  );
  let episodeId: string | null = null;
  if (r.episodeSourceId) {
    episodeId = await requireImportedRef(
      tx,
      tenantId,
      sourceSystem,
      "clinical_episode",
      r.episodeSourceId,
      "episodeSourceId",
    );
  }
  let practitionerId: string | null = null;
  if (r.practitionerKey) {
    practitionerId = resolvers.practitionerIdByKey[r.practitionerKey] ?? null;
    if (!practitionerId)
      throw unresolved("practitionerKey", "practitioner key has no resolver entry");
  }

  const [row] = await tx
    .insert(clinicalRecords)
    .values({
      tenantId,
      patientId,
      episodeId,
      practitionerId,
      data: r.data,
      status: r.status,
      // Provenance: 'manual' until an owner decision on a dedicated source
      // tag (docs/QUESTIONS.md); the staging ledger already records origin.
      source: "manual",
      ...(r.recordedAt ? { createdAt: new Date(r.recordedAt) } : {}),
    })
    .returning({ id: clinicalRecords.id });
  await markImported(tx, tenantId, ledger.stagingRowId, row!.id);
  return "inserted";
}

async function importAttachment(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  a: MigrationAttachment,
  ledger: LedgerState,
): Promise<"inserted" | "updated"> {
  const patientId = a.patientSourceId
    ? await requireImportedRef(
        tx,
        tenantId,
        sourceSystem,
        "patient",
        a.patientSourceId,
        "patientSourceId",
      )
    : null;
  const clinicalRecordId = a.clinicalRecordSourceId
    ? await requireImportedRef(
        tx,
        tenantId,
        sourceSystem,
        "clinical_record",
        a.clinicalRecordSourceId,
        "clinicalRecordSourceId",
      )
    : null;

  const values = {
    patientId,
    clinicalRecordId,
    storagePath: a.storagePath,
    fileName: a.fileName,
    mimeType: a.mimeType ?? null,
    sizeBytes: a.sizeBytes ?? null,
  };

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

/** Ledger lookup for one cross-record reference; throws unresolved when absent. */
async function requireImportedRef(
  tx: DbTx,
  tenantId: string,
  sourceSystem: string,
  entityType: MigrationEntityType,
  sourceId: string,
  field: string,
): Promise<string> {
  const map = await resolveImportedIds(tx, tenantId, sourceSystem, entityType, [sourceId]);
  const id = map.get(sourceId);
  if (!id)
    throw unresolved(field, `referenced ${entityType} is not imported (orphan reference)`);
  return id;
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
