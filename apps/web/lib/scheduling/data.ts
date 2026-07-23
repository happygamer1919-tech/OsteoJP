import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, lt, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  appointmentNotes,
  appointments,
  locations,
  patients,
  roles,
  servicePacks,
  services,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { filterTherapistsByLocation } from "./therapist-location-filter";
import { listTherapistLocationAssignments } from "./therapist-locations";
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
  patientTwoId: string | null;
  patientTwoName: string | null;
  practitionerTwoId: string | null;
  practitionerTwoName: string | null;
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
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
}): AgendaAppointment {
  return {
    ...r,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    confirmationReceivedAt: r.confirmationReceivedAt
      ? r.confirmationReceivedAt.toISOString()
      : null,
  };
}

// Secondary participants (W4-19, 0032) are optional, so they join through
// aliased LEFT joins on patients/users — display-only names for the agenda card
// (+1 badge) and appointment details. Primary-only semantics elsewhere.
const patientTwo = alias(patients, "patient_two");
const practitionerTwo = alias(users, "practitioner_two");
// W9-06 (item 10): a THIRD users reference to resolve `created_by` into a display
// name. Aliased because `users` is already joined for the primary practitioner;
// LEFT because created_by is nullable (portal bookings set it null).
const createdByUser = alias(users, "created_by_user");

const appointmentSelection = {
  id: appointments.id,
  patientId: appointments.patientId,
  patientName: patients.fullName,
  practitionerId: appointments.practitionerId,
  practitionerName: users.fullName,
  // Secondary participants (W4-19) — nullable display names.
  patientTwoId: appointments.patientTwoId,
  patientTwoName: patientTwo.fullName,
  practitionerTwoId: appointments.practitionerTwoId,
  practitionerTwoName: practitionerTwo.fullName,
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
  // Audit provenance (W9-06, item 10). createdBy is nullable (portal bookings);
  // createdByName is resolved via the aliased LEFT join below, null when the
  // creator is not a staff user.
  createdBy: appointments.createdBy,
  createdByName: createdByUser.fullName,
  createdAt: appointments.createdAt,
} as const;

function baseAppointmentQuery(tx: DbTx) {
  return tx
    .select(appointmentSelection)
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(users, eq(users.id, appointments.practitionerId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .leftJoin(services, eq(services.id, appointments.serviceId))
    // Secondary participants (W4-19) — LEFT joins (optional); aliased so patients
    // and users can be joined a second time without colliding with the primaries.
    .leftJoin(patientTwo, eq(patientTwo.id, appointments.patientTwoId))
    .leftJoin(practitionerTwo, eq(practitionerTwo.id, appointments.practitionerTwoId))
    // W9-06 (item 10): resolve created_by -> creator display name. LEFT: null for
    // portal bookings, which have no users row.
    .leftJoin(createdByUser, eq(createdByUser.id, appointments.createdBy));
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
      const [therapistRows, locationRows, serviceRows, packRows] = await Promise.all([
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
        // W8-01c — ACTIVE packs as bookable types (creation-active-only, W6-01b).
        tx
          .select({
            id: servicePacks.id,
            label: servicePacks.name,
            baseServiceId: servicePacks.baseServiceId,
            locationId: servicePacks.locationId,
            sessionCount: servicePacks.sessionCount,
          })
          .from(servicePacks)
          .where(eq(servicePacks.isActive, true))
          .orderBy(asc(servicePacks.name)),
      ]);
      return { therapistRows, locationRows, serviceRows, packRows };
    }),
  ["agenda-stable-ref"],
  { revalidate: 60, tags: ["agenda-reference-data"] },
);

// W9-02 - therapist-to-location assignment map, derived from
// availability_templates. Reference data on the same cadence as the rows above
// (it changes only when an admin edits a therapist's working hours), so it gets
// the same 60s cache and the same invalidation tag. Cached SEPARATELY from
// `fetchStableAgendaRef` on purpose: the ref data is location-independent, so
// keying it per location would multiply four cached lists to narrow only one.
const fetchTherapistLocationAssignments = unstable_cache(
  async (ctx: RequestContext) => {
    const assignments = await listTherapistLocationAssignments(ctx);
    // unstable_cache serializes its return value - a Map does not survive the
    // round-trip, so store entries and rebuild on read.
    return [...assignments.entries()];
  },
  ["agenda-therapist-locations"],
  { revalidate: 60, tags: ["agenda-reference-data"] },
);

/**
 * Dropdown options for the toolbar filters and the appointment modal.
 *
 * `locationId` (W9-02) narrows the therapist list to that location's assigned
 * therapists, per the owner ruling of 2026-07-17. Passing null/undefined means
 * "Todas as localizações" and returns every therapist - the only view in which
 * an unassigned therapist appears. See ./therapist-location-filter.ts for the
 * ruling and the predicate.
 *
 * Callers that pass no locationId keep their pre-W9-02 behaviour exactly.
 */
export async function getAgendaOptions(
  ctx: RequestContext,
  locationId?: string | null,
): Promise<AgendaOptions> {
  // W12-23: the assignment map is now ALWAYS fetched (it is cached 60s), so the
  // booking drawer can scope its therapist dropdown to the form-selected location
  // regardless of the W9-02 toolbar location. The `therapists` field keeps its
  // W9-02 page/toolbar scoping unchanged.
  const [{ therapistRows, locationRows, serviceRows, packRows }, assignmentEntries] =
    await Promise.all([
      fetchStableAgendaRef(ctx),
      fetchTherapistLocationAssignments(ctx),
    ]);

  const assignmentMap = new Map(assignmentEntries);
  const therapists = locationId
    ? filterTherapistsByLocation(therapistRows, assignmentMap, locationId)
    : therapistRows;
  const therapistLocationIds: Record<string, string[]> = {};
  for (const [id, locs] of assignmentMap) therapistLocationIds[id] = [...locs];

  return {
    therapists,
    allTherapists: therapistRows,
    therapistLocationIds,
    locations: locationRows,
    services: serviceRows,
    packs: packRows,
  };
}
