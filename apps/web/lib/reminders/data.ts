import "server-only";
import { and, eq } from "drizzle-orm";
import {
  appointments,
  locations,
  patientTermsAcceptances,
  patients,
  tenants,
  users,
} from "@osteojp/db";
import { withReminderTenantContext } from "./context";
// The version constant, shared with the ficha that writes the row, so the gate
// and the capture can never disagree about which document was accepted.
import { TERMS_VERSION } from "@/lib/clinical/terms-acceptance";

// Tenant-scoped read layer for reminder dispatch. Mirrors lib/scheduling/data:
// every query runs through the tenant-context seam, never filters tenant_id by
// hand, and never touches getDbAdmin. RLS does the scoping.

/** The fields a rendered reminder needs, pulled in one scoped query. */
export type ReminderAppointmentData = {
  appointmentId: string;
  startsAt: Date;
  status: string;
  /** For structured skip logs only (ids are not PII) — never rendered. */
  patientId: string;
  patientName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  patientReminderSmsEnabled: boolean;
  patientReminderEmailEnabled: boolean;
  practitionerName: string;
  locationName: string;
  locationPhone: string | null;
  tenantSettings: unknown;
  /**
   * W13-05: has THIS patient a recorded acceptance of the CURRENT terms version?
   * One of the two inputs to `shouldRenderFeeNotice`; never consumed alone.
   *
   * Loaded here rather than at the render site so the dispatch path makes exactly
   * one scoped read per send, and so a caller cannot render the fee line without
   * having asked the question.
   */
  patientHasAcceptedTerms: boolean;
};

/**
 * Load everything needed to render + address a reminder for one appointment,
 * scoped to the appointment's tenant. Returns null if the appointment is not
 * visible in this tenant context (RLS) — caller treats that as "nothing to do".
 */
export async function loadReminderData(
  tenantId: string,
  appointmentId: string,
): Promise<ReminderAppointmentData | null> {
  return withReminderTenantContext(tenantId, async (tx) => {
    const rows = await tx
      .select({
        appointmentId: appointments.id,
        startsAt: appointments.startsAt,
        status: appointments.status,
        patientId: patients.id,
        patientName: patients.fullName,
        patientEmail: patients.email,
        patientPhone: patients.phone,
        patientReminderSmsEnabled: patients.reminderSmsEnabled,
        patientReminderEmailEnabled: patients.reminderEmailEnabled,
        practitionerName: users.fullName,
        locationName: locations.name,
        locationPhone: locations.phone,
        tenantSettings: tenants.settings,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(users, eq(users.id, appointments.practitionerId))
      .innerJoin(locations, eq(locations.id, appointments.locationId))
      .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // W13-05. A SECOND STATEMENT IN THE SAME TRANSACTION, not a join, and that
    // is deliberate: `patient_terms_acceptances` is append-only with NO unique
    // index, so a patient who re-accepted has several rows and a left join would
    // silently multiply the appointment row. An existence check cannot.
    const accepted = await tx
      .select({ id: patientTermsAcceptances.id })
      .from(patientTermsAcceptances)
      .where(
        and(
          eq(patientTermsAcceptances.patientId, row.patientId),
          eq(patientTermsAcceptances.termsVersion, TERMS_VERSION),
        ),
      )
      .limit(1);

    return { ...row, patientHasAcceptedTerms: accepted.length > 0 };
  });
}
