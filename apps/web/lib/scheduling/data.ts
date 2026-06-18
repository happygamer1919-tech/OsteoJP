import "server-only";
import { and, asc, eq, gte, lt, ne, type SQL } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import {
  appointments,
  locations,
  patients,
  roles,
  services,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import type {
  AgendaAppointment,
  AgendaFilters,
  AgendaOptions,
} from "./types";

/**
 * Server-only read layer for the agenda. Every query runs through
 * runScoped(ctx, …) so RLS scopes it to the caller's tenant — these functions
 * never filter tenant_id themselves, and never touch getDbAdmin.
 */

function mapAppointment(r: {
  id: string;
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  locationId: string;
  locationName: string;
  serviceId: string | null;
  serviceName: string | null;
  room: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AgendaAppointment["status"];
  notes: string | null;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
}): AgendaAppointment {
  return {
    ...r,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
  };
}

const appointmentSelection = {
  id: appointments.id,
  patientId: appointments.patientId,
  patientName: patients.fullName,
  practitionerId: appointments.practitionerId,
  practitionerName: users.fullName,
  locationId: appointments.locationId,
  locationName: locations.name,
  serviceId: appointments.serviceId,
  serviceName: services.name,
  room: appointments.room,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  status: appointments.status,
  notes: appointments.notes,
  recurrenceRule: appointments.recurrenceRule,
  recurrenceParentId: appointments.recurrenceParentId,
} as const;

function baseAppointmentQuery(tx: DbTx) {
  return tx
    .select(appointmentSelection)
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(users, eq(users.id, appointments.practitionerId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .leftJoin(services, eq(services.id, appointments.serviceId));
}

/** Appointments whose start falls in [startUtc, endUtc), optionally filtered. */
export async function listAppointments(
  ctx: RequestContext,
  args: { startUtc: Date; endUtc: Date } & Partial<AgendaFilters>,
): Promise<AgendaAppointment[]> {
  return runScoped(ctx, async (tx) => {
    const conds: SQL[] = [
      gte(appointments.startsAt, args.startUtc),
      lt(appointments.startsAt, args.endUtc),
    ];
    if (args.practitionerId) {
      conds.push(eq(appointments.practitionerId, args.practitionerId));
    }
    if (args.locationId) {
      conds.push(eq(appointments.locationId, args.locationId));
    }
    const rows = await baseAppointmentQuery(tx)
      .where(and(...conds))
      .orderBy(asc(appointments.startsAt));
    return rows.map(mapAppointment);
  });
}

/** A single appointment by id, or null if not visible to this tenant. */
export async function getAppointment(
  ctx: RequestContext,
  id: string,
): Promise<AgendaAppointment | null> {
  return runScoped(ctx, async (tx) => {
    const rows = await baseAppointmentQuery(tx)
      .where(eq(appointments.id, id))
      .limit(1);
    return rows[0] ? mapAppointment(rows[0]) : null;
  });
}

/** Dropdown options for the toolbar filters and the appointment modal. */
export async function getAgendaOptions(
  ctx: RequestContext,
): Promise<AgendaOptions> {
  return runScoped(ctx, async (tx) => {
    const [therapistRows, locationRows, serviceRows] = await Promise.all([
      tx
        .select({ id: users.id, label: users.fullName })
        .from(users)
        // role join keeps reception (non-clinician) out of the therapist list
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(and(eq(users.isActive, true), ne(roles.slug, "reception")))
        .orderBy(asc(users.fullName)),
      tx
        .select({ id: locations.id, label: locations.name })
        .from(locations)
        .where(eq(locations.isActive, true))
        .orderBy(asc(locations.name)),
      tx
        .select({
          id: services.id,
          label: services.name,
          durationMin: services.durationMin,
        })
        .from(services)
        .where(eq(services.isActive, true))
        .orderBy(asc(services.name)),
    ]);

    return {
      therapists: therapistRows,
      locations: locationRows,
      services: serviceRows,
    };
  });
}
