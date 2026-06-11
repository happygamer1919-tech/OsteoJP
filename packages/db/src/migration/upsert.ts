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

      if (st.status === "failed") {
        // Already failed validation; nothing to do until it is re-staged.
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

      // st.status is 'validated' (insert path) or 'imported' (re-run path).
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
        // markFailed only transitions pending|validated; on a re-run failure
        // the row stays 'imported' and the failure is reported in the summary.
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

type LedgerState = { stagingRowId: string; importedEntityId: string | null };

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
): Promise<Map<string, { id: string; status: string; importedEntityId: string | null }>> {
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
function sanitizeImportError(err: unknown): MigrationErrorDetail {
  if (err instanceof MigrationStagingError) return err.errorDetail;

  const pg = err as { code?: string; constraint_name?: string };
  const parts = ["database error"];
  if (typeof pg?.code === "string") parts.push(`sqlstate ${pg.code}`);
  if (typeof pg?.constraint_name === "string") parts.push(`constraint ${pg.constraint_name}`);
  return { code: "import_failed", message: parts.join(", ") };
}
