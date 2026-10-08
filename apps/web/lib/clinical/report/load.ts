import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
import {
  appointments,
  clinicalRecords,
  formTemplates,
  locations,
  patients,
  recordAnnulments,
  tenants,
  users,
  withTenantContext,
  type DbTx,
  type TenantClaims,
} from "@osteojp/db";
import { parseTemplateSchema } from "../form-template";
import { readImporterSourced } from "../record-origin";
import { chooseRecordView } from "../record-view";
import { resolveClinicFiscal } from "./clinic-fiscal";
import type { ReportInputs, RecordStatus } from "./report-model";
import type { SourceLocation } from "./location-contacts";

// Tenant-scoped, READ-ONLY load of everything a clinical-report PDF needs.
// Mirrors lib/reminders/data.ts: every query runs through withTenantContext so
// RLS enforces tenant isolation — we never filter tenant_id by hand and never
// use the BYPASSRLS admin handle. No writes to clinical_records (read-only).
//
// The printing location comes from the record's appointment; a record without
// an appointment falls back to the tenant's first active location.

/** Resolve the printing location for a record: its appointment's, else fallback. */
async function resolvePrintingLocation(
  tx: DbTx,
  appointmentLocation: SourceLocation | null,
): Promise<SourceLocation | null> {
  if (appointmentLocation) return appointmentLocation;
  const rows = await tx
    .select({ name: locations.name, address: locations.address, phone: locations.phone })
    .from(locations)
    .where(eq(locations.isActive, true))
    .orderBy(asc(locations.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Load report inputs for one record, scoped to `claims.tenant_id` via RLS.
 * Returns null if the record is not visible in this tenant context.
 *
 * This does NOT gate on status — the caller (generate.ts) runs the print gate
 * via buildClinicalReportModel so the same rejection path is shared. Loading a
 * draft is allowed; printing it is not.
 *
 * EXPORT-01. `scope` is ANDed into the record read: the therapist read scope
 * the registo page applies (`therapistPatientReadScope` on the record's
 * patient), handed in by `generateRegistoReportPdf`, so a record the page
 * answers 404 for is not found here either. Two more things are read, each in
 * this same transaction and so under the caller's own RLS:
 *   - the record's template schema and its source, and, for a record with no
 *     usable schema, whether the importer wrote it (`readImporterSourced`): the
 *     page's inputs to `chooseRecordView`, asked the way the page asks them;
 *   - the annulment that names the record, if any (record_annulments).
 */
export function loadClinicalReportInputs(
  claims: TenantClaims,
  recordId: string,
  scope?: SQL,
): Promise<ReportInputs | null> {
  return withTenantContext(claims, async (tx) => {
    const rows = await tx
      .select({
        recordId: clinicalRecords.id,
        status: clinicalRecords.status,
        aiReviewState: clinicalRecords.aiReviewState,
        version: clinicalRecords.version,
        episodeId: clinicalRecords.episodeId,
        data: clinicalRecords.data,
        signedAt: clinicalRecords.signedAt,
        createdAt: clinicalRecords.createdAt,
        appointmentStartsAt: appointments.startsAt,
        locName: locations.name,
        locAddress: locations.address,
        locPhone: locations.phone,
        patientName: patients.fullName,
        patientDob: patients.dateOfBirth,
        patientNif: patients.nif,
        practitionerName: users.fullName,
        tenantName: tenants.name,
        tenantNif: tenants.nif,
        signedBy: clinicalRecords.signedBy,
        source: clinicalRecords.source,
        formTemplateId: clinicalRecords.formTemplateId,
        templateSchema: formTemplates.schema,
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .innerJoin(tenants, eq(tenants.id, clinicalRecords.tenantId))
      .leftJoin(users, eq(users.id, clinicalRecords.practitionerId))
      .leftJoin(appointments, eq(appointments.id, clinicalRecords.appointmentId))
      .leftJoin(locations, eq(locations.id, appointments.locationId))
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .where(scope ? and(eq(clinicalRecords.id, recordId), scope) : eq(clinicalRecords.id, recordId))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    // Which body the registo page draws for this record, from the page's own
    // inputs (clinical/[id]/page.tsx): a usable template schema is the form; a
    // record without one asks the importer's ledger, and only then.
    const hasSchema = r.formTemplateId !== null && parseTemplateSchema(r.templateSchema) !== null;
    const view = chooseRecordView({
      hasSchema,
      importerSourced: hasSchema ? false : await readImporterSourced(tx, recordId),
      source: r.source,
      status: r.status,
    });

    // The annulment that names the record, if any. The earliest, should there
    // ever be more than one: the date the record stopped standing.
    const annulment = await tx
      .select({ createdAt: recordAnnulments.createdAt })
      .from(recordAnnulments)
      .where(eq(recordAnnulments.recordId, recordId))
      .orderBy(asc(recordAnnulments.createdAt))
      .limit(1);

    // Signer name (when the record is signed) — separate scoped lookup keeps the
    // main query a single self-join-free statement.
    let signedByName: string | null = null;
    if (r.signedBy) {
      const s = await tx
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, r.signedBy))
        .limit(1);
      signedByName = s[0]?.fullName ?? null;
    }

    const appointmentLocation: SourceLocation | null = r.locName
      ? { name: r.locName, address: r.locAddress, phone: r.locPhone }
      : null;
    const location = await resolvePrintingLocation(tx, appointmentLocation);

    const fiscal = resolveClinicFiscal({ tenantName: r.tenantName, tenantNif: r.tenantNif });

    return {
      record: {
        id: r.recordId,
        status: r.status as RecordStatus,
        aiReviewState: r.aiReviewState ?? null,
        version: r.version,
        episodeId: r.episodeId,
        data: r.data,
        view,
        annulledAt: annulment[0]?.createdAt ?? null,
        consultationDate: r.appointmentStartsAt ?? r.createdAt,
        signedAt: r.signedAt,
      },
      patient: {
        fullName: r.patientName,
        dateOfBirth: r.patientDob ?? null,
        nif: r.patientNif ?? null,
      },
      practitioner: {
        fullName: r.practitionerName ?? null,
        // users has no title column yet — printed empty until one exists.
        title: null,
        signedByName,
      },
      clinic: fiscal,
      location: location ?? { name: fiscal.fiscalName, address: null, phone: null },
    };
  });
}
