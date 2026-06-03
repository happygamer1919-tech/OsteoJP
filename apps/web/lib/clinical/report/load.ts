import "server-only";
import { asc, eq } from "drizzle-orm";
import {
  appointments,
  clinicalRecords,
  locations,
  patients,
  tenants,
  users,
  withTenantContext,
  type DbTx,
  type TenantClaims,
} from "@osteojp/db";
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
 */
export function loadClinicalReportInputs(
  claims: TenantClaims,
  recordId: string,
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
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .innerJoin(tenants, eq(tenants.id, clinicalRecords.tenantId))
      .leftJoin(users, eq(users.id, clinicalRecords.practitionerId))
      .leftJoin(appointments, eq(appointments.id, clinicalRecords.appointmentId))
      .leftJoin(locations, eq(locations.id, appointments.locationId))
      .where(eq(clinicalRecords.id, recordId))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

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
