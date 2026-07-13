import "server-only";
import { asc, eq } from "drizzle-orm";
import {
  appointments,
  clinicalRecords,
  locations,
  patients,
  tenants,
  withTenantContext,
  type DbTx,
  type TenantClaims,
} from "@osteojp/db";
import type { Locale } from "@osteojp/i18n";
import { ClinicalError } from "../errors";
import type { SourceLocation } from "../report/location-contacts";
import { buildRgpdFormModel } from "./rgpd-model";
import { renderRgpdFormPdf } from "./rgpd-pdf";

// Tenant-scoped, READ-ONLY load + render for the RGPD print-and-sign form
// (SPEC-ficha-medica.md sec 7.2). Mirrors lib/clinical/report/load.ts: every
// query runs through withTenantContext so RLS enforces tenant isolation - we
// never filter tenant_id by hand and never use a BYPASSRLS handle. No writes to
// clinical_records (read-only). The printing location comes from the record's
// appointment; a record without an appointment falls back to the tenant's first
// active location (same rule as the clinical report).

export type RgpdFormPdf = {
  bytes: Uint8Array;
  /** Suggested download filename - record id prefix only, never patient PII. */
  filename: string;
};

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
 * Generate the branded A4 RGPD print-and-sign form for a record's patient. The
 * wording is final (W5-33). Read-only: available for a record
 * in ANY status (unlike the clinical report, this is a blank consent form the
 * patient signs by hand, not a finalized-record printout). Throws
 * ClinicalError("not_found") if the record isn't visible in this tenant context.
 */
export async function generateRgpdFormPdf(
  claims: TenantClaims,
  recordId: string,
  locale: Locale,
): Promise<RgpdFormPdf> {
  const inputs = await withTenantContext(claims, async (tx) => {
    const rows = await tx
      .select({
        recordId: clinicalRecords.id,
        patientName: patients.fullName,
        patientNif: patients.nif,
        tenantName: tenants.name,
        tenantNif: tenants.nif,
        locName: locations.name,
        locAddress: locations.address,
        locPhone: locations.phone,
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .innerJoin(tenants, eq(tenants.id, clinicalRecords.tenantId))
      .leftJoin(appointments, eq(appointments.id, clinicalRecords.appointmentId))
      .leftJoin(locations, eq(locations.id, appointments.locationId))
      .where(eq(clinicalRecords.id, recordId))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    const appointmentLocation: SourceLocation | null = r.locName
      ? { name: r.locName, address: r.locAddress, phone: r.locPhone }
      : null;
    const location = await resolvePrintingLocation(tx, appointmentLocation);

    return {
      patient: { fullName: r.patientName, nif: r.patientNif ?? null },
      clinic: { tenantName: r.tenantName, tenantNif: r.tenantNif },
      location: location ?? { name: r.tenantName ?? "OsteoJP", address: null, phone: null },
    };
  });

  if (!inputs) throw new ClinicalError("not_found");

  const model = buildRgpdFormModel(inputs);
  const bytes = await renderRgpdFormPdf(model, locale);

  return { bytes, filename: `consentimento-rgpd-${recordId.slice(0, 8)}.pdf` };
}
