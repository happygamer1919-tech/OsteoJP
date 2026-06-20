import "server-only";
import { eq } from "drizzle-orm";
import {
  appointments,
  locations,
  patients,
  tenants,
  users,
} from "@osteojp/db";
import { withReminderTenantContext } from "./context";

// Tenant-scoped read layer for reminder dispatch. Mirrors lib/scheduling/data:
// every query runs through the tenant-context seam, never filters tenant_id by
// hand, and never touches getDbAdmin. RLS does the scoping.

/** The fields a rendered reminder needs, pulled in one scoped query. */
export type ReminderAppointmentData = {
  appointmentId: string;
  startsAt: Date;
  status: string;
  patientName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  patientReminderSmsEnabled: boolean;
  patientReminderEmailEnabled: boolean;
  practitionerName: string;
  locationName: string;
  locationPhone: string | null;
  tenantSettings: unknown;
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

    return rows[0] ?? null;
  });
}
