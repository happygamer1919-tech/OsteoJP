import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, lt, ne, sql, type SQL } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  appointmentNotes,
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
  confirmationState: AgendaAppointment["confirmationState"];
  confirmationReceivedAt: Date | null;
  confirmationChannel: string | null;
  hasNote: boolean;
}): AgendaAppointment {
  return {
    ...r,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    confirmationReceivedAt: r.confirmationReceivedAt
      ? r.confirmationReceivedAt.toISOString()
      : null,
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
  // Confirmation axis (0024) — orthogonal to `status`, read-only here.
  confirmationState: appointments.confirmationState,
  confirmationReceivedAt: appointments.confirmationReceivedAt,
  confirmationChannel: appointments.confirmationChannel,
  // PRESENT-STATE existence of a per-visit note (W2-04). Truth source for the
  // "Sem nota" indicator: a note added late must CLEAR it, so this reads
  // appointment_notes NOW — NOT the immutable analytics_events.note_present
  // (which stays the historical KPI record). Tenant-scoped: the surrounding
  // query runs under RLS, and the correlation is pinned to the same tenant_id.
  hasNote: sql<boolean>`exists (
    select 1 from ${appointmentNotes}
    where ${appointmentNotes.appointmentId} = ${appointments.id}
      and ${appointmentNotes.tenantId} = ${appointments.tenantId}
  )`.as("has_note"),
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

/**
 * A patient's full appointment history (past + upcoming), most recent first —
 * the "Consultas" tab on the patient profile. Row 3 (schedule-again): the
 * caller decides which of these are eligible for re-booking (past or
 * completed); this query just returns the history, unfiltered by status.
 */
export async function listPatientAppointments(
  ctx: RequestContext,
  patientId: string,
): Promise<AgendaAppointment[]> {
  assertCan(ctx.role, "appointments:read");
  return runScoped(ctx, async (tx) => {
    const rows = await baseAppointmentQuery(tx)
      .where(eq(appointments.patientId, patientId))
      .orderBy(desc(appointments.startsAt));
    return rows.map(mapAppointment);
  });
}

// Therapists, locations, and services are stable reference data — they change
// only when an admin makes a configuration change, at most a few times a year.
// Cache per-tenant for 60 seconds to avoid 3 DB round-trips on every agenda load.
// The cache key includes tenantId + userId so RLS-filtered results are never
// shared across tenants or roles. Tagged `agenda-reference-data` for targeted
// invalidation when admin makes config changes.
const fetchStableAgendaRef = unstable_cache(
  async (ctx: RequestContext) =>
    runScoped(ctx, async (tx) => {
      const [therapistRows, locationRows, serviceRows] = await Promise.all([
        tx
          .select({ id: users.id, label: users.fullName })
          .from(users)
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
            contraindicationSensitive: services.contraindicationSensitive,
          })
          .from(services)
          .where(eq(services.isActive, true))
          .orderBy(asc(services.name)),
      ]);
      return { therapistRows, locationRows, serviceRows };
    }),
  ["agenda-stable-ref"],
  { revalidate: 60, tags: ["agenda-reference-data"] },
);

/** Dropdown options for the toolbar filters and the appointment modal. */
export async function getAgendaOptions(
  ctx: RequestContext,
): Promise<AgendaOptions> {
  const { therapistRows, locationRows, serviceRows } =
    await fetchStableAgendaRef(ctx);
  return {
    therapists: therapistRows,
    locations: locationRows,
    services: serviceRows,
  };
}
