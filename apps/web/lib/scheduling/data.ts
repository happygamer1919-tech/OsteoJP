import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  appointmentNotes,
  appointments,
  locations,
  patients,
  servicePacks,
  services,
  staffLocations,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { bookingLocationScope, viewerLocationScope } from "@/lib/auth/viewer-locations";
import { filterBookableTherapists } from "./therapist-bookable";
import {
  filterRosterByViewerScope,
  filterTherapistsByLocation,
} from "./therapist-location-filter";
import { readTherapistLocationAssignments } from "./therapist-locations";
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
  // NULL = WITHHELD, never "unnamed". See baseAppointmentQuery.
  patientName: string | null;
  practitionerId: string;
  practitionerName: string;
  colorKey: string | null;
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
  noteCount: number;
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
  // W12-40-T2: the practitioner's assigned agenda colour — the first non-null
  // staff_locations.color for this user (oldest membership = one colour per
  // person, the SAME rule the Equipa card uses). Correlated + tenant-pinned
  // (the outer query runs under RLS); NULL → the agenda's FNV fallback.
  colorKey: sql<string | null>`(
    select ${staffLocations.color} from ${staffLocations}
    where ${staffLocations.userId} = ${appointments.practitionerId}
      and ${staffLocations.tenantId} = ${appointments.tenantId}
      and ${staffLocations.color} is not null
    order by ${staffLocations.createdAt} asc
    limit 1
  )`.as("colorKey"),
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
  // W12-13 (notes unification, R3): the agenda/Marcacoes note now reads the
  // UNIFIED store (appointment_notes) — the LATEST note appended for this visit —
  // and falls back to the legacy `appointments.notes` while the one-time backfill
  // (owner-gated, held) has not run. COALESCE picks exactly one string, so it is
  // dedup-safe in every state: pre-backfill an appointment with only a legacy
  // note shows it; once a note is appended (or after backfill) the unified row
  // wins and the legacy fallback is dormant. Correlated + tenant-pinned; the
  // outer query runs under RLS.
  notes: sql<string | null>`coalesce(
    (select ${appointmentNotes.body} from ${appointmentNotes}
      where ${appointmentNotes.appointmentId} = ${appointments.id}
        and ${appointmentNotes.tenantId} = ${appointments.tenantId}
      order by ${appointmentNotes.createdAt} desc
      limit 1),
    ${appointments.notes}
  )`.as("notes"),
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
  // W12-13: kept consistent with the coalesced `notes` above — a legacy
  // `appointments.notes` (not yet backfilled into appointment_notes) also counts
  // as "has note", so the chip never contradicts the note the hover shows.
  hasNote: sql<boolean>`(
    exists (
      select 1 from ${appointmentNotes}
      where ${appointmentNotes.appointmentId} = ${appointments.id}
        and ${appointmentNotes.tenantId} = ${appointments.tenantId}
    )
    or nullif(btrim(${appointments.notes}), '') is not null
  )`.as("has_note"),
  // PL-17: how many notes this visit carries. The hover shows the LATEST note
  // (the coalesce above); with a thread that is only honest if the reader can
  // see there are others - "Última nota (de 3)". ::int because count() is a
  // bigint, which the driver would hand back as a string.
  noteCount: sql<number>`(
    select count(*)::int from ${appointmentNotes}
    where ${appointmentNotes.appointmentId} = ${appointments.id}
      and ${appointmentNotes.tenantId} = ${appointments.tenantId}
  )`.as("note_count"),
  // Audit provenance (W9-06, item 10). createdBy is nullable (portal bookings);
  // createdByName is resolved via the aliased LEFT join below, null when the
  // creator is not a staff user.
  createdBy: appointments.createdBy,
  createdByName: createdByUser.fullName,
  createdAt: appointments.createdAt,
} as const;

/**
 * ==========================================================================
 * SEC-appointment-vanishes-with-patient-scope - WHY `patients` IS A LEFT JOIN
 * ==========================================================================
 * IT WAS AN INNER JOIN, AND AN APPOINTMENT WHOSE PATIENT ROW THE VIEWER CANNOT
 * SEE DISAPPEARED ENTIRELY. Not with the name withheld: gone from the result
 * set, with nothing anywhere saying a row had been dropped. Every agenda
 * surface reads through this query - /agenda, /marcacoes, the dashboard - so
 * the slot showed as FREE and reception would book over it, or tell a patient
 * their appointment does not exist. 0061's exclusion constraint would then
 * refuse the write as `double_booked` for an appointment nobody could see.
 *
 * THE TWO SCOPES ARE DIFFERENT SCOPES AND CAN DISAGREE. `listAppointments`
 * filters APPOINTMENTS by `viewerLocationScope` (the viewer's assigned
 * locations); `patients_select` since 0073 admits a reception/admin viewer to
 * `viewer_visible_patient_ids()`, and since 0074 a therapist to
 * `viewer_treated_patient_ids()`. An appointment at a location the viewer can
 * see, for a patient the viewer cannot, is exactly the shape that vanished.
 * `getAppointment` and `listPatientAppointments` do not filter by location at
 * all, so for them any disagreement is reachable.
 *
 * THE OWNER RULED IT (CONFIRM-09): left join, and render the slot as occupied
 * with the name withheld. `patientName` is therefore `string | null` on
 * `AgendaAppointment` and NULL MEANS WITHHELD - it is not a missing value and
 * it is not a patient with no name. `appointments.patient_id` is NOT NULL and
 * carries an FK, so a null name can mean nothing else, and the type change is
 * what makes every consumer state what it does about it rather than rendering
 * an empty string.
 *
 * ==========================================================================
 * `users` AND `locations` STAY INNER, AND THAT IS CHECKED RATHER THAN ASSUMED
 * ==========================================================================
 * Both carry TENANT-ONLY isolation and nothing has ever narrowed them:
 * `users_tenant_isolation` and `locations_tenant_isolation` (0001) are
 * `USING (tenant_id = jwt_tenant_id())`, and the only later migrations naming
 * them (0005, 0036) add columns and say in terms that no new isolation surface
 * is created. Both columns are NOT NULL with an FK, so within a tenant the row
 * always exists and is always visible, and the inner join cannot drop anything.
 * `patients` is the ONE join on this query that is narrowed PER ROW.
 *
 * IF THAT EVER CHANGES, THIS COMMENT IS THE THING THAT IS NOW WRONG, and
 * `scheduling-scope.test.ts` fails rather than the agenda quietly losing rows
 * again: it reads the migrations and asserts those two policies are still
 * tenant-only.
 */
function baseAppointmentQuery(tx: DbTx) {
  return tx
    .select(appointmentSelection)
    .from(appointments)
    .leftJoin(patients, eq(patients.id, appointments.patientId))
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
  // PL-09 Phase 1: reception + admin only see their assigned location(s)' agenda,
  // enforced HERE so every caller (agenda, marcacoes, dashboard) is consistent.
  // owner is unrestricted; a therapist is practitioner-locked by the caller;
  // an unassigned reception/admin falls back to all (viewerLocationScope -> null).
  const locationScope = await viewerLocationScope(ctx);
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
    if (locationScope) {
      conds.push(inArray(appointments.locationId, locationScope));
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

// Therapists, locations, services, packs AND the therapist-to-location map:
// stable reference data that changes only when an admin makes a configuration
// change, at most a few times a year. Cached 60s and tagged
// `agenda-reference-data` for targeted invalidation.
//
// ==========================================================================
// ONE CACHE ENTRY AND ONE TRANSACTION. PERF-06, the approved batching hybrid.
// ==========================================================================
// This was TWO `unstable_cache` entries opening TWO `runScoped` transactions
// back to back. Both were keyed on the same `ctx`, both revalidated at 60s and
// both carried the same tag, so they expired together, missed together and hit
// together - two transactions that were never independent in practice.
//
// WHAT THE SPLIT COST, and it is a count rather than an estimate: a second
// `runScoped` is BEGIN + `set local role` + `set_config` + COMMIT, four
// statements and four network round trips on production, wrapped around two
// `selectDistinct`s. PERF-03 measured that ceremony at ~78% of the server slot
// on reads this small.
//
// WHAT IT DID NOT COST, stated because the old comment's reasoning was sound
// and is preserved: the ref data is location-independent, so nothing here is
// keyed per location and no cached list is multiplied to narrow one of them.
// Merging changes the transaction count, not the cache key.
//
// THE CACHE IS THE REASON THIS IS SMALLER THAN IT LOOKS, and the honest number
// is on the card: on a WARM cache these reads cost nothing at all, so the win
// is on the cold path. At 197 agenda renders per 12 hours across several staff,
// a 60-second entry is usually cold by the next render - which is why the cold
// path is the common one here and not the exception.
//
// KEY PART CHANGED to `agenda-reference-v2` deliberately: the cached VALUE now
// has a different shape, and reusing `agenda-stable-ref` would let a deploy
// read an old entry back into the new destructure.
const fetchAgendaReferenceData = unstable_cache(
  async (ctx: RequestContext) =>
    runScoped(ctx, async (tx) => {
      const [rawTherapistRows, locationRows, serviceRows, packRows, assignments] =
        await Promise.all([
          // PL-06b: the Terapeuta source is BOOKABLE practitioners, decided by the
          // explicit is_bookable flag (migration 0046) — NOT derived from role or
          // service-mapping count (the PL-05 derivation that dropped JP). Fetch each
          // active user's flag and apply the rule in ./therapist-bookable.ts. No
          // roles/therapist_services join is needed any more.
          tx
            .select({
              id: users.id,
              label: users.fullName,
              isBookable: users.isBookable,
            })
            .from(users)
            .where(eq(users.isActive, true))
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
          // W9-02 / PL-14 — therapist-to-location assignments, on THIS transaction.
          readTherapistLocationAssignments(tx),
        ]);
      // Bookable-practitioner rule (is_bookable flag) applied here so
      // `therapistRows` (and thus both `therapists` and `allTherapists`
      // downstream) never carries a non-bookable staff row. Map back to the
      // {id,label} shape the callers expect.
      const therapistRows = filterBookableTherapists(rawTherapistRows).map(({ id, label }) => ({
        id,
        label,
      }));
      // unstable_cache serializes its return value - a Map does not survive the
      // round-trip, so store entries and rebuild on read.
      return {
        therapistRows,
        locationRows,
        serviceRows,
        packRows,
        assignmentEntries: [...assignments.entries()],
      };
    }),
  ["agenda-reference-v2"],
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
  // TWO awaits, not three. `viewerLocationScope` is React-cache()d per request
  // and is already resolved by app/agenda/page.tsx:70 before this runs, so it
  // costs no transaction here; the reference read is the only one that can.
  const [{ therapistRows, locationRows, serviceRows, packRows, assignmentEntries }, locationScope] =
    await Promise.all([fetchAgendaReferenceData(ctx), viewerLocationScope(ctx)]);

  const assignmentMap = new Map(assignmentEntries);

  // PL-14: a location-scoped viewer never sees ANOTHER clinic's roster. Before
  // this, an LV-only admin's "Todos os terapeutas" listed all 16 staff including
  // CB-only therapists (the W9-02 comment deferred it as "Phase 1b"); the owner
  // CR of 2026-07-30 closes it. A therapist with NO assignment at all is kept -
  // they belong to no clinic, so hiding them would be a data-entry gap silently
  // removing a real person, not isolation. The owner (scope null) is unaffected.
  const rosterRows = filterRosterByViewerScope(therapistRows, assignmentMap, locationScope);

  const therapists = locationId
    ? filterTherapistsByLocation(rosterRows, assignmentMap, locationId)
    : rosterRows;
  const therapistLocationIds: Record<string, string[]> = {};
  for (const [id, locs] of assignmentMap) therapistLocationIds[id] = [...locs];

  // PL-09 Phase 1: reception + admin only pick from their assigned location(s).
  // The appointment DATA is already location-scoped in listAppointments; this
  // just narrows the location list so they can't select another clinic. PL-14:
  // when this leaves exactly ONE location the UI renders no control at all and
  // the server pins it (scopedLocationId) - the list below is then a label, not
  // a choice. The therapist roster is narrowed on the same axis above (the
  // "Phase 1b" this comment used to defer), now that staff_locations is seeded.
  const locations = locationScope
    ? locationRows.filter((l) => locationScope.includes(l.id))
    : locationRows;

  // STAFF-02: the WRITE scope, which is NOT the read scope above.
  //
  // `locations` is narrowed by `viewerLocationScope`, which returns null for a
  // THERAPIST - correct for reads, because a therapist is bounded by their
  // own-data rules rather than by location. The owner then ruled that
  // therapists, like reception and admin, may only BOOK into their assigned
  // locations. Reusing the read scope would have left exactly that gap open one
  // role over.
  //
  // Both scopes call resolveViewerLocationIds; neither has its own query. Two
  // sources of location truth drift silently, and the drift would be invisible
  // until somebody booked into a clinic they cannot see - which is precisely how
  // this defect was found.
  const bookingScope = await bookingLocationScope(ctx);
  const bookableLocations = bookingScope
    ? locationRows.filter((l) => bookingScope.includes(l.id))
    : locationRows;

  return {
    therapists,
    allTherapists: rosterRows,
    therapistLocationIds,
    locations,
    bookableLocations,
    services: serviceRows,
    packs: packRows,
  };
}
