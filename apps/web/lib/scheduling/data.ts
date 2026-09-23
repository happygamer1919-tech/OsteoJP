import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { listSharedResourcesTx } from "./shared-resources";
import { alias } from "drizzle-orm/pg-core";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  appointmentNotes,
  appointments,
  locations,
  patients,
  servicePacks,
  services,
  sharedResourceNamesFnPresent,
  staffLocations,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { bookingLocationScope, viewerLocationScope } from "@/lib/auth/viewer-locations";
import { mayReadNotePreviews } from "@/lib/notes/audience";
import {
  readLatestAppointmentNotes,
  readLatestPatientNotes,
  type LatestNote,
} from "@/lib/notes/latest-notes";
import { filterBookableTherapists } from "./therapist-bookable";
import {
  filterRosterByViewerScope,
  filterTherapistsByLocation,
} from "./therapist-location-filter";
import { readTherapistLocationAssignments } from "./therapist-locations";
import { clinicCodeMap, resolveStaffCollisions } from "./staff-options";
import type {
  AgendaAppointment,
  AgendaFilters,
  AgendaOptions,
  AppointmentStatusValue,
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
  /**
   * ==========================================================================
   * WITHHELD WITH THE NAME. RB-NOTES, 2026-09-07.
   * ==========================================================================
   * `patients` is a LEFT JOIN (SEC-appointment-vanishes-with-patient-scope), so
   * an appointment whose patient this viewer may not see still renders — as an
   * occupied slot with the name withheld, which is the owner's ruling and is
   * about the SLOT.
   *
   * IT WAS NOT ABOUT THE NOTE, AND THE NOTE CAME THROUGH ANYWAY. Both
   * subqueries below correlate on `appointment_id`, and `appointment_notes` RLS
   * is TENANT-ONLY (0026) — there is no location arm and no therapist arm. So
   * `patientName` was withheld while the latest CLINICAL NOTE for that same
   * visit was projected beside it, and rendered: on the agenda/Marcações hover
   * (`appointment-hover-card.tsx`) and prefilled into the drawer's notes field.
   * The name is the less sensitive of the two.
   *
   * `patients.id IS NOT NULL` IS EXACTLY "THE PATIENT ROW SURVIVED
   * `patients_select`", computed by the join that is already here. It is the
   * same question `getPatient` answers for the full notes view, asked of the
   * row rather than of an id, so the preview and the board cannot come apart.
   *
   * WHAT IS DELIBERATELY *NOT* GATED: `hasNote` and `noteCount`. They carry no
   * note text — one drives the "Sem nota" chip that tells reception a completed
   * visit was never documented, the other says how many exist — and withholding
   * them would take a scheduling signal away to protect nothing.
   */
  notes: sql<string | null>`case when ${patients.id} is not null then coalesce(
    (select ${appointmentNotes.body} from ${appointmentNotes}
      where ${appointmentNotes.appointmentId} = ${appointments.id}
        and ${appointmentNotes.tenantId} = ${appointments.tenantId}
      order by ${appointmentNotes.createdAt} desc
      limit 1),
    ${appointments.notes}
  ) end`.as("notes"),
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
  args: {
    startUtc: Date;
    endUtc: Date;
    /**
     * SCHED-17: a SET of practitioners, for a therapist's merged default view
     * ({ self } plus the shared resources at their locations). Takes precedence
     * over `practitionerId` when non-empty.
     */
    practitionerIds?: readonly string[] | null;
  } & Partial<AgendaFilters>,
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
    // SCHED-29.3: a SHARED RESOURCE's agenda is its bookings in BOTH roles. A
    // booking with NESA as Terapeuta 2 holds NESA's hour (SCHED-29.2), so NESA's
    // diary must draw it; for a therapist, 0088 is what lets RLS return a
    // colleague's. A person's Terapeuta 2 rows stay off that person's agenda
    // (W4-19): only ids that are shared resources widen the filter.
    const asked =
      args.practitionerIds && args.practitionerIds.length > 0
        ? [...args.practitionerIds]
        : args.practitionerId
          ? [args.practitionerId]
          : [];
    if (asked.length > 0) {
      const resources = new Set((await listSharedResourcesTx(tx)).map((r) => r.id));
      const resourceIds = asked.filter((id) => resources.has(id));
      conds.push(
        resourceIds.length > 0
          ? or(
              inArray(appointments.practitionerId, asked),
              inArray(appointments.practitionerTwoId, resourceIds),
            )!
          : inArray(appointments.practitionerId, asked),
      );
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
    return (await withSharedResourceNames(tx, rows)).map(mapAppointment);
  });
}

/**
 * NESA-NAMES (owner request 2026-09-17) — the patient's name on a shared
 * resource's booking, for the therapists at that clinic.
 *
 * ==========================================================================
 * WHY AN OVERLAY AND NOT A COLUMN ON `appointmentSelection`
 * ==========================================================================
 * `patients` is LEFT JOINed and `patients_select` (0074) admits a therapist only
 * to patients they have treated, so a NESA booking's patient row is not returned
 * to them and `patients.full_name` arrives NULL. That NULL is what
 * `patientLabel` turns into "Marcação reservada".
 *
 * The fix cannot be a wider join or a wider policy: `patients_select` is the one
 * gate in front of the ficha, the phone and the NIF, and the ruling forbids
 * touching it. So the name comes from a narrow SECURITY DEFINER function that
 * returns an appointment id and a display name and nothing else, and this
 * function overlays it.
 *
 * ==========================================================================
 * IT ONLY EVER FILLS A NULL
 * ==========================================================================
 * A row whose name RLS already returned is left exactly as it was. So this can
 * only ever turn a withheld label into a name, and never change a name.
 *
 * ==========================================================================
 * AND IT ASKS BEFORE IT NAMES THE FUNCTION — 42883 IS NOT "NO ROWS"
 * ==========================================================================
 * THE CLAIM THAT STOOD HERE WAS WRONG, and it was wrong in the direction that
 * matters. It said that with the migration absent "the query returns nothing and
 * every row passes through untouched". It does not: selecting FROM a function
 * that does not exist raises 42883, which aborts the statement and, inside
 * `runScoped`, the entire read. Unguarded, this overlay does not degrade to "no
 * names" — it takes `listAppointments` down, and with it the agenda, Marcações
 * and the dashboard, on every database that has not had the pending SQL applied.
 *
 * That is measured, not feared. On a database at 0088, four arms of two suites
 * that pass on main failed with
 * `PostgresError: function public.shared_resource_appointment_patient_names() does not exist`
 * — appointment-scope's dashboard and count arms, and both of
 * nesa-agenda-second-participant's merged-agenda arms. None of them is about
 * NESA names; they simply read the agenda.
 *
 * So the schema is asked first, the SCHED-17 way (`sharedResourceNamesFnPresent`,
 * beside the column probe it copies), and until the function exists this returns
 * the rows it was handed. THAT is what makes the app half deployable before the
 * apply — the ask, not the hope.
 *
 * ==========================================================================
 * SCOPED TO THIS READ, DELIBERATELY
 * ==========================================================================
 * `listAppointments` is the agenda, Marcações and the dashboard — the CARD
 * surfaces the ruling names. `getAppointment` (the drawer) is NOT overlaid: it
 * carries note previews and the edit form, which is more than "the same card
 * fields", and widening it is a separate ruling.
 */
async function withSharedResourceNames<T extends { id: string; patientName: string | null }>(
  tx: DbTx,
  rows: T[],
): Promise<T[]> {
  const withheld = rows.filter((r) => r.patientName === null).map((r) => r.id);
  if (withheld.length === 0) return rows;

  // THE SCHEMA GATE, ASKED ONLY WHEN THERE IS SOMETHING TO FILL. A page with no
  // withheld name has already returned above, so no read pays for this probe
  // unnecessarily; this page has at least one, which makes the answer worth a
  // single round trip that is then cached for the life of the process.
  if (!(await sharedResourceNamesFnPresent(tx))) return rows;

  // BOUNDED BY THE ROWS ON SCREEN. The function is nullary and would otherwise
  // answer for every shared-resource booking the viewer's clinics have ever
  // held; the ids here are the ones this page is about to render.
  const ids = sql.join(
    withheld.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const named = (await tx.execute(sql`
    select appointment_id, patient_name
      from public.shared_resource_appointment_patient_names()
     where appointment_id in (${ids})
  `)) as unknown as ReadonlyArray<{ appointment_id: string; patient_name: string | null }>;
  if (named.length === 0) return rows;

  const byId = new Map(
    named.filter((n) => n.patient_name !== null).map((n) => [n.appointment_id, n.patient_name!]),
  );
  return rows.map((r) =>
    r.patientName === null && byId.has(r.id) ? { ...r, patientName: byId.get(r.id)! } : r,
  );
}

/**
 * RB-NOTES — the two note excerpts a Marcações row shows without a click.
 *
 * ==========================================================================
 * A SEPARATE READ, NOT TWO MORE COLUMNS ON `appointmentSelection`
 * ==========================================================================
 * That selection is shared by EVERY agenda surface — /agenda, the dashboard,
 * `getAppointment`, `listPatientAppointments`. Adding the patient-note text
 * there would make all of them pay for it and, worse, would serialise a
 * clinical note into the RSC payload of screens that never draw one. That is
 * the distinction the timing panel records and INC-CONFIRM-10 paid for:
 * granting is not the same as drawing, and a component that receives data it
 * declines to render has already shipped it.
 *
 * So the excerpts are fetched by the ONE page that renders them, in its own
 * statement, and travel to the client as their own prop.
 *
 * ==========================================================================
 * TWO STATEMENTS, NOT TWO PER ROW, AND BOTH INSIDE THE CALLER'S TRANSACTION
 * ==========================================================================
 * One for the appointment notes, keyed on the appointment ids; one for the
 * patient notes, keyed on the DISTINCT patient ids — a patient with four
 * marcações in the window is read once. They are issued together.
 *
 * ==========================================================================
 * THE SCOPE IS `latest-notes.ts`'s AND IS NOT RESTATED HERE
 * ==========================================================================
 * Both reads go through `patients`, so `patients_select` decides. An
 * appointment whose patient is withheld yields NO entry in either map — the
 * same rule the `notes` column above now applies to the hover. Read that file's
 * header before changing either.
 */
export async function listAppointmentNotePreviews(
  ctx: RequestContext,
  appts: readonly { id: string; patientId: string }[],
): Promise<Map<string, { patient: LatestNote | null; appointment: LatestNote | null }>> {
  assertCan(ctx.role, "appointments:read");
  const out = new Map<string, { patient: LatestNote | null; appointment: LatestNote | null }>();
  // ASKED BEFORE THE STATEMENT IS SENT. For a principal without the capability
  // the reads are never issued and no note text enters the process.
  if (appts.length === 0 || !mayReadNotePreviews(ctx)) return out;

  // A patient with four marcações in the window is read ONCE.
  const patientIds = [...new Set(appts.map((a) => a.patientId))];

  const { byAppointment, byPatient } = await runScoped(ctx, async (tx) => {
    const [byAppointment, byPatient] = await Promise.all([
      readLatestAppointmentNotes(tx, appts),
      readLatestPatientNotes(tx, patientIds),
    ]);
    return { byAppointment, byPatient };
  });

  for (const a of appts) {
    const patient = byPatient.get(a.patientId) ?? null;
    const appointment = byAppointment.get(a.id) ?? null;
    // A row with neither gets NO entry at all, so the component has one absence
    // to handle and cannot draw an empty pair of labels.
    if (patient || appointment) out.set(a.id, { patient, appointment });
  }
  return out;
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
 * U1 — the Marcações-tab filters, applied IN SQL.
 *
 * ==========================================================================
 * EVERY FIELD HERE IS A COLUMN THAT ALREADY EXISTS. NO MIGRATION.
 * ==========================================================================
 *   from/to        -> appointments.starts_at   (timestamptz)
 *   status         -> appointments.status      (enum, multi-select)
 *   practitionerId -> appointments.practitioner_id OR practitioner_2_id
 *   locationId     -> appointments.location_id
 *   serviceId      -> appointments.service_id
 *   withoutNote    -> the NEGATION of the `hasNote` expression this file
 *                     already computes, over appointment_notes (index
 *                     `appointment_notes_appointment_idx`) and the legacy
 *                     appointments.notes column.
 * The patient-scoped read rides `appointments_patient_idx`, so none of these
 * needs a new index either.
 *
 * `from`/`to` ARE UTC INSTANTS, not calendar dates, and the caller converts.
 * The clinic thinks in Lisbon days and the column is an instant; doing that
 * conversion here would put timezone logic in the data layer and a second copy
 * of it beside `/marcacoes`, which already computes `startUtc`/`endUtc` in its
 * page. `to` is EXCLUSIVE for the same reason that one is: a half-open range is
 * the only shape that includes every instant of the last day without naming
 * 23:59:59.999.
 *
 * TERAPEUTA MATCHES BOTH PRACTITIONER SLOTS. A NESA visit records a second
 * practitioner (0032), and a therapist filtering their own history would
 * otherwise lose every appointment where they were the second one. Same
 * reasoning `listPatientsPage` applies to patient_id / patient_2_id.
 */
export type PatientAppointmentFilters = {
  /** Inclusive lower bound, as a UTC instant. */
  fromUtc?: Date | null;
  /** EXCLUSIVE upper bound, as a UTC instant (caller adds the day). */
  toUtc?: Date | null;
  /** Multi-select Estado. Empty or absent means every estado. */
  status?: readonly AppointmentStatusValue[] | null;
  practitionerId?: string | null;
  locationId?: string | null;
  serviceId?: string | null;
  /** "Sem nota" — only visits carrying no note at all. */
  withoutNote?: boolean;
  /** Newest first (default) or oldest first. */
  order?: "newest" | "oldest";
};

/**
 * A patient's appointment history (past + upcoming), most recent first — the
 * "Consultas" tab on the patient profile. Row 3 (schedule-again): the caller
 * decides which of these are eligible for re-booking (past or completed); this
 * query returns the history, unfiltered by status unless asked.
 *
 * `filters` is OPTIONAL and omitting it returns exactly what it always did, so
 * the Declaração de Presença prefill (which wants the whole history) and the
 * note-selector are unchanged.
 */
export async function listPatientAppointments(
  ctx: RequestContext,
  patientId: string,
  filters?: PatientAppointmentFilters,
): Promise<AgendaAppointment[]> {
  assertCan(ctx.role, "appointments:read");
  return runScoped(ctx, async (tx) => {
    const rows = await baseAppointmentQuery(tx)
      .where(and(eq(appointments.patientId, patientId), ...patientAppointmentConditions(filters)))
      .orderBy(
        filters?.order === "oldest" ? asc(appointments.startsAt) : desc(appointments.startsAt),
      );
    return rows.map(mapAppointment);
  });
}

/**
 * The filter clauses, built separately so a test can assert the SHAPE of the
 * narrowing without a database, and so the count query and the row query can
 * never disagree about what "filtered" means.
 *
 * Absent and empty are both "do not narrow": a filter the user has not set must
 * not remove rows, and an empty multi-select is not "match nothing".
 */
export function patientAppointmentConditions(filters?: PatientAppointmentFilters): SQL[] {
  const out: SQL[] = [];
  if (!filters) return out;

  if (filters.fromUtc) out.push(gte(appointments.startsAt, filters.fromUtc));
  // `lt`, not `lte`: the caller passes the start of the day AFTER the range.
  if (filters.toUtc) out.push(lt(appointments.startsAt, filters.toUtc));

  if (filters.status && filters.status.length > 0) {
    out.push(inArray(appointments.status, [...filters.status]));
  }

  if (filters.practitionerId) {
    const p = filters.practitionerId;
    const bothSlots = or(
      eq(appointments.practitionerId, p),
      eq(appointments.practitionerTwoId, p),
    );
    if (bothSlots) out.push(bothSlots);
  }

  if (filters.locationId) out.push(eq(appointments.locationId, filters.locationId));
  if (filters.serviceId) out.push(eq(appointments.serviceId, filters.serviceId));

  if (filters.withoutNote) {
    // The exact negation of the `hasNote` projection above, kept beside it on
    // purpose: if one changes and the other does not, the chip and the filter
    // start disagreeing about the same visit.
    out.push(
      sql`not (
        exists (
          select 1 from ${appointmentNotes}
          where ${appointmentNotes.appointmentId} = ${appointments.id}
            and ${appointmentNotes.tenantId} = ${appointments.tenantId}
        )
        or nullif(btrim(${appointments.notes}), '') is not null
      )`,
    );
  }

  return out;
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
            // 0085: the clinic's own hours travel with its name. Selected
            // here rather than in a second query because every caller that
            // needs the window already holds this list, and a second read is a
            // second answer to "when is this clinic open".
            .select({
              id: locations.id,
              label: locations.name,
              opensAt: locations.opensAt,
              closesAt: locations.closesAt,
              middayClosedFrom: locations.middayClosedFrom,
              middayClosedTo: locations.middayClosedTo,
            })
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
 * `keepStaffId` (NESA-SCOPE) is the id a caller's control currently holds (the
 * ficha's ?terapeuta=). It survives the therapist clinic scoping and the name
 * collision rule below, so a filter never paints its "all" option while the
 * page is filtered by an id the list no longer carries.
 * It does NOT reopen PL-14: a row that scope hides stays hidden.
 *
 * Callers that pass no locationId keep their pre-W9-02 behaviour exactly.
 */
export async function getAgendaOptions(
  ctx: RequestContext,
  locationId?: string | null,
  opts?: { keepStaffId?: string | null },
): Promise<AgendaOptions> {
  // W12-23: the assignment map is now ALWAYS fetched (it is cached 60s), so the
  // booking drawer can scope its therapist dropdown to the form-selected location
  // regardless of the W9-02 toolbar location. The `therapists` field keeps its
  // W9-02 page/toolbar scoping unchanged.
  // Still ONE transaction. `viewerLocationScope` and `bookingLocationScope` both
  // go through the React-cache()d `resolveViewerLocationIds`, already resolved by
  // app/agenda/page.tsx before this runs, so neither costs a transaction here;
  // the reference read is the only one that can.
  const [
    { therapistRows, locationRows, serviceRows, packRows, assignmentEntries },
    locationScope,
    bookingScope,
  ] = await Promise.all([
    fetchAgendaReferenceData(ctx),
    viewerLocationScope(ctx),
    bookingLocationScope(ctx),
  ]);

  const assignmentMap = new Map(assignmentEntries);

  // PL-14: a location-scoped viewer never sees ANOTHER clinic's roster. Before
  // this, an LV-only admin's "Todos os terapeutas" listed all 16 staff including
  // CB-only therapists (the W9-02 comment deferred it as "Phase 1b"); the owner
  // CR of 2026-07-30 closes it. A therapist with NO assignment at all is kept -
  // they belong to no clinic, so hiding them would be a data-entry gap silently
  // removing a real person, not isolation. The owner (scope null) is unaffected.
  const pl14Rows = filterRosterByViewerScope(therapistRows, assignmentMap, locationScope);

  // NESA-SCOPE: a THERAPIST's read scope is null (their reads are bounded by
  // own-data rules), so PL-14 lists every colleague for them. The staff they
  // are offered is narrowed here to their own clinics, on the same predicate,
  // keeping unassigned colleagues, the caller's current value and ALWAYS the
  // therapist themselves: the assignment map is cached for 60 seconds and the
  // booking scope is read per request, so for a minute after a clinic move the
  // two can disagree, and a therapist must never vanish from their own list. Where a
  // therapist sees this list at all: the edit drawer's Terapeuta and the ficha's
  // Consultas filter (the toolbar and Marcacoes filters are hidden for them,
  // Horarios lists only themselves, block time shows only their own name).
  const therapistScoped =
    ctx.role === "therapist" && bookingScope
      ? new Set(filterRosterByViewerScope(pl14Rows, assignmentMap, bookingScope).map((t) => t.id))
      : null;
  const scopedRows = therapistScoped
    ? pl14Rows.filter((t) => therapistScoped.has(t.id) || t.id === ctx.userId || t.id === opts?.keepStaffId)
    : pl14Rows;

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
  const bookableLocations = bookingScope
    ? locationRows.filter((l) => bookingScope.includes(l.id))
    : locationRows;

  // NESA-SCOPE: two staff rows with one name (one machine per clinic). The
  // viewer's clinics are the booking scope's: every active clinic for the owner
  // and for an unassigned staffer, their staff_locations otherwise. Computed
  // HERE, after the 60-second shared cache and never inside it, because the
  // labels depend on who is looking. The toolbar narrowing below runs on the
  // labelled roster, so a label never changes with the toolbar's clinic.
  const viewerClinicIds = bookableLocations.map((l) => l.id);
  const clinicCodeById = clinicCodeMap(locationRows);
  const rosterRows = resolveStaffCollisions(scopedRows, {
    viewerClinicIds,
    assignments: assignmentMap,
    clinicCodeById,
    keepId: opts?.keepStaffId ?? null,
    selfId: ctx.userId,
  });

  const therapists = locationId
    ? filterTherapistsByLocation(rosterRows, assignmentMap, locationId)
    : rosterRows;
  const therapistLocationIds: Record<string, string[]> = {};
  for (const [id, locs] of assignmentMap) therapistLocationIds[id] = [...locs];

  return {
    therapists,
    allTherapists: rosterRows,
    therapistLocationIds,
    locations,
    bookableLocations,
    services: serviceRows,
    packs: packRows,
    viewerClinicIds,
    clinicCodes: Object.fromEntries(clinicCodeById),
  };
}
